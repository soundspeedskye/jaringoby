# 방 공지 게시판 — 설계

- 문서 상태: **설계안 (검토 대기 · 구현 전)**
- 범위: 방장이 올린 공지를 방 멤버가 읽는 게시판
- 함께 볼 문서: [아키텍처](ARCHITECTURE.md) · [운영 정책](02-product-policy.md) · [Supabase 계약](../supabase/README.md)

> 이 문서는 검토를 받기 위한 설계안이다. 승인 전에는 코드를 작성하지 않는다.

---

## 1. 범위

**방장이 쓰고, 방 멤버 전원이 읽는다.** 방장은 자기가 올린 공지를 수정·삭제할 수 있다.

| 동작 | 포함 | 비고 |
|---|---|---|
| 방장이 공지 작성 | ✅ | `add_room_notice` |
| 멤버가 공지 열람 | ✅ | RLS select |
| 방장이 공지 수정 | ✅ | `update_room_notice`, 낙관적 버전 대조 |
| 방장이 공지 삭제 | ✅ | `delete_room_notice`, 소프트 삭제 |
| 공지 고정(pin) | ❌ | 최신순으로 충분. 필요해지면 컬럼 1개 추가 |
| 공지 제목 | ❌ | 본문 앞 2줄을 목록 미리보기로 사용 |
| 공지별 읽음 표시 | ❌ | 기존 소식함(`notifications`)으로 대체 (§4.4) |
| 공지 댓글·반응 | ❌ | 가장 비싼 확장. §10 참고 |

**설계 원칙**: 기존 모듈을 재설계하지 않고 **덧붙인다.** 새 테이블 1개 · 새 RPC 3개 · 스냅샷 배열 1개 · 새 라우트 2개. 지출·댓글·정산 경로는 건드리지 않는다.

---

## 2. 도메인 위치

```
Room (방)
  ├─ RoomMember
  ├─ InviteCode
  ├─ RoomNotice  ← 신규. 방에 직접 매달린다 (주차와 무관)
  └─ Period …
```

공지는 **Room 소유**이지 Period 소유가 아니다. 주차가 끝나도 공지는 남고, S/E/C/F phase 규칙의 영향을 받지 않는다. 지출·댓글과의 가장 큰 차이이며, 덕분에 `src/domain/permissions.ts`를 확장할 필요가 없다 — 권한 조건이 "방장인가 / 방이 열려 있는가" 둘뿐이다.

---

## 3. 데이터 모델

### 3.1 테이블

`supabase/migrations/20260815000000_add_room_notices.sql`

```sql
create table public.room_notices (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  client_request_id uuid not null,
  constraint room_notices_body_length
    check (char_length(btrim(body)) between 1 and 500),
  unique (author_id, client_request_id)
);

create index room_notices_room_idx
  on public.room_notices (room_id, created_at desc);

alter table public.room_notices enable row level security;
```

**필드 판단 근거**

- `body`만 두고 `title`은 두지 않는다. 목록에서 본문 앞 2줄을 미리보기로 쓴다. 나중에 nullable `title`을 더하는 건 무해한 덧셈이다.
- `version` + `updated_at`은 지출·댓글이 이미 쓰는 낙관적 동시성 계약을 그대로 따른다. 방장 한 명이 쓰는 자원이라 충돌 가능성은 낮지만, 기기 두 대에서 같은 공지를 편집하는 경우를 조용히 덮어쓰지 않기 위함이다.
- `deleted_at` 소프트 삭제. 읽기 경로는 전부 `deleted_at is null`로 필터한다. 하드 삭제를 하지 않는 이유는 감사 로그(`write_audit_event`)와 짝이 맞고, 삭제 사고를 DB에서 되돌릴 수 있기 때문이다.
- `client_request_id` + `unique (author_id, client_request_id)`는 `expenses`/`comments`와 동일한 멱등 계약. 응답을 못 받고 재시도해도 공지가 두 번 올라가지 않는다.
- `is_pinned`는 넣지 않는다. 작성자가 방장 한 명뿐이라 최신순이면 충분하다.

### 3.2 RLS

읽기 정책 하나만 만든다. insert/update/delete 정책은 **만들지 않는다** → 쓰기는 `SECURITY DEFINER` RPC로만 가능하다 (`comment_reactions`와 같은 형태).

```sql
create policy room_notices_read_room_members
on public.room_notices
for select
to authenticated
using (private.is_room_member(room_id, (select auth.uid())));
```

**결정 지점 — `is_room_member` vs `is_active_room_member`**
`is_room_member`(모든 멤버십 상태)를 쓰면 `expenses`·`comments`의 기존 읽기 정책과 일관되고, 나간 뒤에도 과거 기록을 읽는 현재 동작과 맞는다. 대신 나간 멤버가 그 뒤 올라온 공지까지 읽을 수 있다 — 지출에서 이미 참인 성질이다. 클라이언트가 나간 방을 목록에서 감추므로 실질 노출은 없다.
공지만 더 엄격하게 하려면 `is_active_room_member`로 바꾸는 한 줄이면 되지만, 그러면 방을 나간 순간 과거 공지도 함께 사라진다. **권고: 일관성을 택해 `is_room_member`.**

### 3.3 Realtime

```sql
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'room_notices'
     ) then
    alter publication supabase_realtime add table public.room_notices;
  end if;
end;
$$;
```

---

## 4. RPC

세 함수 모두 공개 래퍼는 `SECURITY INVOKER` + `search_path = ''`, 실제 구현은 `private.*_impl`의 `SECURITY DEFINER`다. grant 형태는 `toggle_comment_reaction`을 그대로 따른다.

```sql
revoke all on function private.<impl>(...) from public, anon;
grant execute on function private.<impl>(...) to authenticated;
revoke execute on function public.<wrapper>(...) from public, anon, service_role;
grant execute on function public.<wrapper>(...) to authenticated;
```

### 4.1 공통 방장 가드

세 구현 모두 같은 순서로 검증한다 (`update_room_settings_impl`의 관용구).

1. `auth.uid()`가 null → `42501 authentication required`
2. `select … from public.rooms where id = <room> for update`
3. 행 없음 또는 `owner_id <> auth.uid()` → `42501 only the room owner can manage notices`
4. `status = 'closed'` → `22023 closed rooms are read-only`

**주차 phase는 검사하지 않는다.** 정산이 끝난 주에도 다음 주 공지를 올리고 고칠 수 있어야 한다.

### 4.2 `add_room_notice`

| 항목 | 값 |
|---|---|
| 시그니처 | `public.add_room_notice(p_room_id uuid, p_body text, p_client_request_id uuid)` |
| 반환 | `public.room_notices` 1행 |

§4.1 가드 후:

5. `char_length(btrim(p_body)) not between 1 and 500` → `22023 notice body must be 1 to 500 characters`
6. `(author_id, client_request_id)`로 기존 행 조회 → 있으면 **그 행을 그대로 반환** (멱등)
7. insert
8. 활성 멤버 전원(작성자 제외)에게 `private.enqueue_notification(...)` — §4.4
9. `private.write_audit_event(v_user_id, 'room.notice_created', 'room', p_room_id, …)`

### 4.3 `update_room_notice` · `delete_room_notice`

| 항목 | update | delete |
|---|---|---|
| 시그니처 | `(p_notice_id uuid, p_body text, p_expected_version int4)` | `(p_notice_id uuid, p_expected_version int4)` |
| 반환 | 갱신된 행 | 소프트 삭제된 행 |

공통 흐름: 공지 행을 `for update`로 잠그고 → `deleted_at is not null`이면 `22023 notice is already deleted` → 그 공지의 `room_id`로 §4.1 가드 → `version <> p_expected_version`이면 `40001 notice was modified by someone else` → 수행.

- **update**: 본문 길이 검사 후 `body`, `updated_at = now()`, `version = version + 1`. 감사 이벤트 `room.notice_updated`.
- **delete**: `deleted_at = now()`, `version = version + 1`. 감사 이벤트 `room.notice_deleted`.
- **댓글의 5분 편집 창은 적용하지 않는다.** 댓글의 시간 제한은 "쓴 말을 나중에 바꿔치기하지 못하게" 하는 규칙이고, 공지는 작성자 개인이 아니라 **방장 역할**의 권한이다. 오탈자를 다음 날 고치는 게 정상 동작이다.
- **수정·삭제는 소식을 다시 보내지 않는다.** 방장이 오탈자를 고칠 때마다 전원에게 알림이 가면 소음이 된다.

### 4.4 소식(notification) 연동

```sql
alter type public.notification_kind add value if not exists 'room_notice';
```

- `enqueue_notification` 인자: `kind = 'room_notice'`, `actor_id = 작성자`, `room_id = 방`, `period_id/expense_id/comment_id = null`, `route = '/room/notices'`, `dedupe_key = 'room_notice:' || v_notice_id::text`.
- **마이그레이션 주의**: Postgres는 같은 트랜잭션에서 새로 추가한 enum 값을 _사용_ 할 수 없다. 새 값은 plpgsql 함수 **본문 문자열 안에서만** 등장하므로(마이그레이션 시점에 실행되지 않음) 한 파일로 안전하다 — `20260812000000_add_in_app_feed_notifications.sql`이 `expense_created`로 이미 검증한 방식이다. 마이그레이션 중에 새 enum 값을 직접 insert하려 들면 깨진다.
- **route가 개별 공지가 아니라 목록(`/room/notices`)을 가리키는 것이 중요하다.** 방장이 공지를 지워도 소식함 항목이 깨진 링크가 되지 않고, 그냥 목록에서 사라진다.

이 연동 덕분에 **공지별 읽음 상태 테이블이 필요 없다.** 공지가 올라오면 멤버의 소식함에 한 줄이 쌓이고, 홈 헤더의 종 배지(`useUnreadNotificationCount`)가 그대로 재사용된다.

---

## 5. 클라이언트 — 계층별 변경

### 5.1 `src/data/types.ts`

```ts
/** 방장이 올리는 방 공지. 주차와 무관하게 방에 매달린다. */
export type RoomNotice = {
  id: string;
  roomId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
};

export type AddRoomNoticeInput = {
  roomId: string;
  body: string;
  clientRequestId: string;
};
```

`AppSnapshot`에 `roomNotices: RoomNotice[]` 추가.

### 5.2 `src/data/repository.ts`

```ts
addRoomNotice(input: AddRoomNoticeInput): Promise<RoomNotice>;
updateRoomNotice(noticeId: string, body: string): Promise<RoomNotice>;
deleteRoomNotice(noticeId: string): Promise<void>;
```

`expectedVersion`은 인터페이스에 노출하지 않는다. 지출·댓글과 같이 리포지토리가 스냅샷의 현재 `version`을 읽어 넘긴다 (`requireVersion` 헬퍼 재사용).

### 5.3 `src/data/supabase-repository.ts`

| 위치 | 변경 |
|---|---|
| `REALTIME_TABLES` | `'room_notices'` 추가 |
| `fetchRoomNoticeRows()` | 신규 private 메서드. `select id,room_id,author_id,body,created_at,updated_at,version` · `is('deleted_at', null)` · `order('created_at', desc)` · `limit(200)` |
| `fetchSnapshot()` | `Promise.all`에 추가하고, 반환 시 `visibleRoomIds`로 필터 후 `mapRoomNotice` |
| `mapRoomNotice(row)` | 신규 매퍼 |
| `fetchRealtimeSnapshot()` | `canPatchSnapshot` 허용 목록에 `'room_notices'` 추가. 공지는 지출·댓글과 얽히지 않고 `previous.rooms`에만 의존하므로, 그 테이블만 재조회해 방 ID로 필터하면 끝난다 |
| 쓰기 3종 | RPC 호출 후 `reloadRealtimeTablesAndNotify(new Set(['room_notices']))` |

### 5.4 `src/data/offline-queue-repository.ts`

공지 3종은 **큐에 넣지 않고 base로 그대로 위임**한다. 사진이 없어 큐잉이 기술적으로 어렵진 않지만, 방장 1인의 저빈도 동작이라 오프라인 낙관적 반영의 이득이 큐 스키마·재시도 UI 확장 비용을 넘지 않는다. 오프라인이면 실패하고 사용자가 다시 누른다.

### 5.5 `src/store/`

- `app-store.ts` — `shareAppSnapshot`에 `roomNotices: shareRecords(previous.roomNotices, incoming.roomNotices, (v) => v.id)` 한 줄.
- `app-indexes.ts` — `noticesByRoomId: Map<string, RoomNotice[]>`. `snapshot.roomNotices === previousSnapshot.roomNotices`면 이전 인덱스 재사용, 아니면 `groupValues`. `createEmptyIndexes()`에도 빈 Map 추가.
- `app-selectors.ts` — 변경 없음. 공지는 파생 상태가 아니라 조회 대상이다.

### 5.6 `src/providers/app-data-hooks.ts`

```ts
/** 방 공지 최신순. 방장이 아니어도 전원 읽는다. */
export function useRoomNotices(roomId: string | undefined): RoomNotice[];
/** 홈 헤더 미리보기용. 목록의 첫 항목. */
export function useLatestRoomNotice(roomId: string | undefined): RoomNotice | undefined;
```

`usePeriodExpenses` 등과 같은 `useIndexedArray` + `shallowArrayEqual` 패턴. 빈 배열은 모듈 상수 `EMPTY_NOTICES`로 참조 안정성을 유지한다.

### 5.7 `src/providers/app-actions-provider.tsx`

`addRoomNotice` · `updateRoomNotice` · `deleteRoomNotice`를 액션으로 노출. 기존 `execute`/`reportError` 래핑을 그대로 탄다.

---

## 6. UI 설계

### 6.1 진입점 — 홈 헤더 공지 카드

`src/components/room/room-home-header.tsx`의 `RoomHero`와 `RecentExpenseCarousel` 사이에 카드 하나를 끼운다. 헤더는 이미 `ExceptionApprovalInbox` → 히어로 → 캐러셀 → 초대 섹션 → 배너 순의 조립체라, 새 블록을 더하는 것이 기존 구성과 어긋나지 않는다.

```
┌─────────────────────────────────────────┐
│ 📌 공지                          더보기 › │
│ 이번 주는 수요일이 공휴일이라 …            │
│ 방장 · 8월 15일                          │
└─────────────────────────────────────────┘
```

- 공지가 없으면 **카드를 렌더하지 않는다.** 단, 방장에게는 "첫 공지 남기기" 한 줄을 대신 보여준다 (방장만 진입 경로가 필요하므로).
- 본문은 `numberOfLines={2}`.
- 카드 전체가 `Pressable` → `/room/notices`.
- 스타일은 `palette.paper` 배경 + `palette.line` 테두리 + `radii.md`. 종이 톤 방향과 `NoticeBanner`의 기존 어휘를 따른다.

### 6.2 목록 화면 — `src/app/room/notices.tsx` (push)

- `ScreenFrame` + `FlatList` + `PageHeader title="공지"` — `notifications.tsx`와 같은 골격.
- 행: 본문 전문(줄 수 제한 없음) · 작성자 `AnimalAvatar` + 닉네임 · `formatDateLabel(createdAt)` · 수정됐으면 "· 수정됨".
- **상세 화면은 두지 않는다.** 본문이 500자 이하라 목록에서 전문을 펼쳐도 충분하고, 라우트가 하나 줄며, 삭제된 공지로 향하는 깨진 딥링크가 생기지 않는다.
- **방장에게만** 각 행 우측에 `dots-horizontal` 버튼 → `useAppDialog`의 `showDialog("공지", …, [취소 / 수정 / 삭제])`. 삭제는 `style: "destructive"` + 2차 확인.
- 빈 상태: `EmptyState`, 아이콘 `bullhorn-outline`. 문구는 방장이면 "첫 공지를 남겨 보세요.", 아니면 "아직 공지가 없어요."
- 방장이면 헤더 우측에 "공지 쓰기" 버튼.

### 6.3 작성·수정 화면 — `src/app/room/notice-edit.tsx` (모달)

- 작성과 수정이 같은 화면이다. `?noticeId=` 쿼리 유무로 분기 — `expense/[id]`가 아니라 `room/edit.tsx`의 폼 구성(`ModalFormScreen` + `Field` + `PrimaryButton`)을 따른다.
- `Field`는 multiline, `maxLength={500}`, 잔여 글자 수 표시.
- 방장이 아니면 진입 경로를 노출하지 않고, 진입 시에도 방어적으로 `router.back()`.
- 제출: 신규면 `clientRequestId = makeUuid()`로 `addRoomNotice`, 수정이면 `updateRoomNotice`. 성공 시 `router.back()`.
- **버튼 숨김은 UX일 뿐 보안이 아니다.** 실제 거부는 RPC가 한다.

### 6.4 소식함 연동 — `src/app/notifications.tsx`

두 군데를 손댄다.

1. `notificationCopy`에 `case "room_notice": return \`${actor}님이 공지를 올렸어요.\`;`
2. `openNotification`이 현재 `expenseId`가 없으면 무조건 `router.replace("/")`다. `kind === "room_notice"`일 때 `router.push("/room/notices")`로 가도록 분기 추가.

### 6.5 라우트 등록

`src/app/_layout.tsx`의 `Stack`에 `room/notices`(push)와 `room/notice-edit`(모달)를 기존 방 라우트 옆에 등록.

---

## 7. 권한 요약

| 행위 | 조건 | 강제 위치 |
|---|---|---|
| 공지 읽기 | 그 방의 멤버십 보유 | RLS `room_notices_read_room_members` |
| 공지 작성 | 방장 본인 **그리고** 방이 `open` | RPC `add_room_notice` |
| 공지 수정 | 방장 본인 · 방이 `open` · 버전 일치 · 미삭제 | RPC `update_room_notice` |
| 공지 삭제 | 위와 동일 | RPC `delete_room_notice` (소프트) |
| 주차 phase 제약 | **없음** | — |

방장 위임(`leaveRoom(successorId)`) 후에는 **새 방장이 이전 방장의 공지도 수정·삭제할 수 있다.** 권한 기준이 `author_id`가 아니라 `rooms.owner_id`이기 때문이며, 이것이 의도한 동작이다 — 공지는 개인의 글이 아니라 방의 게시물이다.

---

## 8. 파일별 작업 목록

| 파일 | 종류 |
|---|---|
| `supabase/migrations/20260815000000_add_room_notices.sql` | 신규 |
| `supabase/README.md` | 수정 (RPC 표 · read model 표 · Notifications 절) |
| `src/data/types.ts` | 수정 (타입 2개 + 스냅샷 필드) |
| `src/data/repository.ts` | 수정 (메서드 3개) |
| `src/data/supabase-repository.ts` | 수정 (§5.3) |
| `src/data/offline-queue-repository.ts` | 수정 (위임 3개) |
| `src/store/app-store.ts` · `app-indexes.ts` | 수정 |
| `src/providers/app-data-hooks.ts` · `app-actions-provider.tsx` | 수정 |
| `src/components/room/room-notice-card.tsx` | 신규 |
| `src/components/room/room-home-header.tsx` | 수정 (카드 1개 삽입) |
| `src/app/room/notices.tsx` · `src/app/room/notice-edit.tsx` | 신규 |
| `src/app/notifications.tsx` · `src/app/_layout.tsx` | 수정 |
| `docs/ARCHITECTURE.md` | 수정 (도메인 개념도 · 라우트 표) |

> **DB push는 사용자가 직접** 수행한다. 코드 작업은 마이그레이션 파일 작성까지다.

---

## 9. 검증

- `src/data/supabase-repository.test.ts` — 스냅샷 로드가 `roomNotices`를 채우는지, 보이지 않는 방의 공지가 걸러지는지, 삭제된 공지가 빠지는지.
- `src/store/app-indexes.test.ts` — `roomNotices` 참조가 그대로일 때 `noticesByRoomId`가 재사용되는지.
- `src/test/app-snapshot-fixture.ts` — `roomNotices: []` 채우기 (타입 확장에 따른 필수 수선).
- `npm run qa` 통과.
- 수동: ① 방장이 작성 → 다른 계정 홈 카드·소식함 배지 ② 일반 멤버에게 작성/수정/삭제 버튼이 없는지 ③ 수정 후 "수정됨" 표시와 소식이 **다시 오지 않는지** ④ 삭제한 공지의 기존 소식함 항목을 눌렀을 때 목록으로 가고 깨지지 않는지 ⑤ 방장 위임 후 새 방장이 이전 공지를 수정할 수 있는지.

---

## 10. 이후 확장 경로

| 항목 | 확장 방법 |
|---|---|
| 고정(pin) | `is_pinned boolean` 컬럼 + 정렬 키 변경 |
| 제목 | nullable `title` 컬럼 추가 |
| 공지별 읽음 | `room_notice_reads(notice_id, user_id, read_at)` — 소식함 배지로 부족하다고 판명될 때만 |
| 댓글·반응 | `comments`가 `expense_id`에 묶여 있어 다형 참조 또는 별도 테이블이 필요하다. 가장 비싼 확장이므로 별도 판단 |
| 오프라인 작성 | `OfflineQueueRepository`에 `ADD_ROOM_NOTICE` 작업 종류 추가 |
