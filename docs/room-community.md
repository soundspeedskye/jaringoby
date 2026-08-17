# 떠든 사람 — 방 게시판 설계

- 문서 상태: **설계안 (검토 대기 · 구현 전)**
- 범위: 방 안에서 지출과 무관한 이야기를 나누는 게시판. 방장 공지 포함
- 관계: 승인되면 [room-notice-board.md](room-notice-board.md)를 흡수한다 (§2 D2)

---

## 1. 범위

**기본은 커뮤니티 글이고, 방장에게만 "공지" 체크박스가 있다.**

| 동작 | 포함 | 비고 |
|---|---|---|
| 활성 멤버가 글 작성 | ✅ | `kind = 'post'` |
| 방장이 공지 작성 | ✅ | `kind = 'notice'` — 체크박스 |
| 방 멤버 전원 열람 | ✅ | RLS select |
| 글에 댓글 | ✅ | `room_post_comments` (§2 D3) |
| 이모지 반응 ❤️👍👏 | ✅ | 글에만. 댓글에는 달지 않는다 |
| 수정 · 삭제 | ✅ | 작성자 본인 / 방장(모더레이션) |
| 소식(알림) 발송 | **공지만** | 일반 글·댓글은 보내지 않는다 |
| 답글(1단계 대댓글) | ❌ | 지출 댓글과 달리 평면 목록 |
| 고정(pin) 여러 개 · 제목 · 이미지 · 멘션 | ❌ | §8 |

**이름**: 화면 제목과 홈 카드 라벨은 **"떠든 사람"**. 코드·테이블은 `room_posts` / `board`로 두고 표시 문구만 한국어로 간다.

---

## 2. 결정 사항

### D1. 범위 단위 — **방** (확정)

글은 방에 매달린다. 주차마다 리셋하지 않는다.

다만 쓴 시점의 진행 주차 `period_id`를 **도장처럼 찍어둔다**(주말·대기 중이면 null). 목록을 주차 헤더로 묶어 보여주고, `history/[id]`(지난 챌린지 상세)에서 그 주 글만 뽑는 것도 같은 컬럼으로 공짜다.

> `period_id`는 `on delete set null`. 방장이 보관된 주차를 삭제(`deleteArchivedPeriod`)해도 글은 살아남아야 한다.

### D2. 공지와 통합 — **합친다** (확정)

`room_posts` 한 테이블에 `kind`(`notice` | `post`). 두 기능의 실질 차이는 "누가 쓸 수 있는가" 한 줄뿐이고, 나머지(본문 제한·소프트 삭제·버전·멱등 키·RLS·실시간·화면 골격)는 전부 같다. 공지 기능의 추가 비용이 enum 컬럼 1개 + 권한 분기 1개로 줄어든다.

### D3. 댓글 — **별도 `room_post_comments` 테이블** (확정)

기존 `comments` 테이블은 `expense_id uuid **not null** references expenses`다. 여기에 글 댓글을 태우려면 다형화(`expense_id` nullable + `post_id` 추가)해야 하는데, 그 테이블에는 알림 트리거·반응·오프라인 큐·`permissions.ts`가 전부 물려 있다. 앱에서 가장 하중이 큰 경로를 게시판 때문에 흔드는 건 값이 맞지 않는다.

**별도 테이블로 간다.** 스키마가 거의 같아 보이는 중복이 생기지만, 그 중복은 두 경로를 서로 독립적으로 바꿀 수 있게 해주는 값어치를 한다. 실제로 규칙이 이미 다르다 — 지출 댓글은 phase에 잠기고, 글 댓글은 잠기지 않는다.

**답글은 넣지 않는다.** 지출 댓글의 `reply_to_comment_id`와 `domain/replies.ts` 규칙은 가져오지 않고 평면 목록으로 둔다.

---

## 3. 데이터 모델

`supabase/migrations/20260818000000_add_room_posts.sql`

```sql
create type public.room_post_kind as enum ('notice', 'post');

create table public.room_posts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  -- 쓴 시점의 진행 주차 도장. 주말·대기 중이면 null.
  period_id uuid references public.periods (id) on delete set null,
  kind public.room_post_kind not null default 'post',
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  client_request_id uuid not null,
  constraint room_posts_body_length
    check (char_length(btrim(body)) between 1 and 500),
  unique (author_id, client_request_id)
);

create table public.room_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.room_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version integer not null default 1,
  client_request_id uuid not null,
  constraint room_post_comments_body_length
    check (char_length(btrim(body)) between 1 and 300),
  unique (author_id, client_request_id)
);

create table public.room_post_reactions (
  post_id uuid not null references public.room_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji),
  constraint room_post_reactions_emoji_check check (emoji in ('❤️', '👍', '👏'))
);

create index room_posts_room_idx on public.room_posts (room_id, created_at desc);
create index room_posts_period_idx on public.room_posts (period_id, created_at desc)
  where period_id is not null;
create index room_post_comments_post_idx
  on public.room_post_comments (post_id, created_at);
```

- 글 본문 500자, **댓글 300자.** 댓글이 글보다 길어질 이유가 없다.
- 세 테이블 모두 RLS 켜고 **select 정책만** 만든다. insert/update/delete 정책은 만들지 않는다 → 쓰기는 `SECURITY DEFINER` RPC 전용 (`comment_reactions`와 같은 형태).
- 읽기 범위는 `private.is_room_member(room_id, auth.uid())` — 모든 멤버십 상태. `expenses`·`comments`의 기존 정책과 일관되고, 클라이언트가 나간 방을 감추므로 실질 노출은 없다. 댓글·반응은 상위 `room_posts`를 타고 같은 조건을 검사한다.
- 세 테이블 모두 `supabase_realtime` publication에 추가.

---

## 4. RPC

| RPC | 인자 | 권한 |
|---|---|---|
| `add_room_post` | `p_room_id, p_kind, p_body, p_client_request_id` | `notice` → 방장 / `post` → 활성 멤버 |
| `update_room_post` | `p_post_id, p_body, p_expected_version` | 작성자 본인 (공지는 현 방장도) |
| `delete_room_post` | `p_post_id, p_expected_version` | 작성자 본인 **또는 방장** |
| `add_room_post_comment` | `p_post_id, p_body, p_client_request_id` | 활성 멤버 |
| `update_room_post_comment` | `p_comment_id, p_body, p_expected_version` | 작성자 본인 |
| `delete_room_post_comment` | `p_comment_id, p_expected_version` | 작성자 본인 **또는 방장** |
| `toggle_room_post_reaction` | `p_post_id, p_emoji` | 활성 멤버 |

공통 가드 (`update_room_settings_impl` 관용구): `auth.uid()` null → `42501` · 방 `for update` 잠금 후 `status = 'closed'` → `22023 closed rooms are read-only` · kind별 권한 → `deleted_at` 검사 → `version <> p_expected_version` → `40001` · 본문 길이 → `write_audit_event`.

- **`period_id`는 클라이언트가 보내지 않고 RPC가 찍는다.** 서버가 그 방의 현재 진행 주차를 조회해 넣고, 없으면 null. 클라이언트를 믿으면 지난 주차에 글을 끼워 넣을 수 있다.
- **주차 phase(S/E/C/F)는 검사하지 않는다.** 정산이 끝났다고 잡담이 잠길 이유가 없다. 잠그는 건 방이 `closed`일 때뿐이며, 그래서 `src/domain/permissions.ts`를 확장하지 않는다.
- **댓글에도 편집 시간 제한을 두지 않는다.** 지출 댓글의 5분 제한이 제거됐으므로(마이그레이션 `20260817000000`) 새로 만드는 곳에 되살릴 이유가 없다.

### 소식 — 공지만

```sql
alter type public.notification_kind add value if not exists 'room_notice';
```

`kind = 'notice'`일 때만 활성 멤버 전원(작성자 제외)에게 발송. 일반 글·댓글·반응은 소식을 만들지 않는다. route는 개별 글이 아니라 목록 `/room/board` — 글이 지워져도 깨진 링크가 남지 않는다. dedupe key는 `'room_notice:' || post_id`.

> 마이그레이션 주의: Postgres는 같은 트랜잭션에서 새로 추가한 enum 값을 *사용*할 수 없다. `room_notice`는 plpgsql 함수 **본문 문자열 안에서만** 등장하므로 한 파일로 안전하다 — `20260812000000`이 `expense_created`로 검증한 방식이다.

---

## 5. 클라이언트

계층별로 손대는 자리와 방식은 지출·댓글 경로와 동일하다.

- **`src/data/types.ts`** — `RoomPost`(`kind: 'NOTICE' | 'POST'`, `periodId?`), `RoomPostComment`, `RoomPostReaction`. `AppSnapshot`에 배열 3개.
- **`src/data/repository.ts`** — RPC 7개에 대응하는 메서드 7개. `expectedVersion`은 인터페이스에 노출하지 않고 리포지토리가 스냅샷에서 읽어 넘긴다 (`requireVersion` 재사용).
- **`src/data/supabase-repository.ts`** — `REALTIME_TABLES`에 세 테이블 추가, fetch 메서드 3개, 매퍼 3개, `fetchSnapshot` 합류, `canPatchSnapshot` 허용 목록 추가(방 목록에만 의존해 부분 패치가 쉽다).
- **`src/store/app-indexes.ts`** — `postsByRoomId`, `commentsByPostId`, `commentCountByPostId`, `reactionsByPostId`. 참조 동일성 재사용 가드는 기존 패턴 그대로.
- **`src/providers/app-data-hooks.ts`** — `useRoomPosts(roomId)`, `useLatestNotice(roomId)`, `usePostComments(postId)`, `useReactionsByPostId(...)`.
- **이모지 상수** — `COMMENT_REACTION_EMOJIS`를 `REACTION_EMOJIS`로 일반화하고 `CommentReactionEmoji`는 별칭으로 남긴다. 두 벌로 갈라두면 반드시 어긋난다.
- **오프라인 큐** — 위임만 하고 큐잉하지 않는다 (사진 없는 저빈도 동작).

---

## 6. 화면 설계 — 게시판형

### 6.1 진입점

홈 헤더(`room-home-header.tsx`)의 `RoomHero`와 `RecentExpenseCarousel` 사이에 **읽기 전용** 미리보기 카드. 최신 공지가 있으면 공지를, 없으면 최신 글 2줄. 탭하면 `/room/board`.

**탭바는 건드리지 않는다.** 탭을 하나 더 다는 건 곁다리 기능이 주인공 자리를 뺏는 일이다.

### 6.2 `/room/board` — 목록 (push)

```
 ←  떠든 사람                         ✎     ← 헤더 우측 작성 버튼
┌ 📌 공지 ───────────────────────┐
│ 수요일 공휴일이라 한도가 줄어요 │          최신 공지 1건, 최상단 1회
└────────────────────────────────┘          (sticky 아님)
──────  8월 3주차  ──────                    period_id로 묶은 헤더
┌────────────────────────────────┐
│ 🐿 스카이              8월 15일 ⋯│
│ 회식이라 좀 쓸게요               │
│ [❤️ 2] [👍] [👏]      💬 2      │
│ ─────────────────────────────  │
│  민준  나도 낄래                 │        댓글 2건까지 카드 안에서 미리보기
│  하늘  ㅋㅋㅋ                    │
│  댓글 쓰기…                      │
└────────────────────────────────┘
┌────────────────────────────────┐
│ 🦊 민준                8월 14일 │
│ 오늘 커피 참았다                 │
│ [👏 3]                💬 0      │
└────────────────────────────────┘
──────  8월 2주차  ──────
```

- 최신이 위(내림차순). 최신 공지 1건만 최상단으로 끌어올리고, 지난 공지는 흐름 안에 `kind` 배지를 달고 섞인다. 공지 카드 스타일은 §6.2.1.
- `period_id`가 null인 글(주말·대기 중 작성)은 맨 위 "이번 주 밖" 묶음으로.
- 카드 안에 **댓글 2건까지 미리보기** + "댓글 N개 모두 보기". 3건 이상이면 상세로.
- 수정·삭제는 `⋯`(`dots-horizontal`) → `useAppDialog` 액션 시트. 노출 조건은 작성자 본인 또는 방장.
- 반응 pill은 지출 댓글의 반응 UI를 그대로 재사용.
- 빈 상태: `EmptyState`, 아이콘 `chat-outline`, "아직 떠든 사람이 없어요."

#### 6.2.1 공지 카드 구분 — 조용한 라벨

공지와 일반 글은 **같은 종이**를 쓰고, 라벨과 테두리 진하기로만 구분한다.

| 요소 | 공지 | 일반 글 |
|---|---|---|
| 배경 | `palette.paper` | `palette.paper` (같음) |
| 테두리 | **`#C6B58B`** (신규 토큰 `palette.lineStrong`) | `palette.rule` |
| 라벨 | `palette.green` 채운 pill + `pin` 아이콘 + "공지" | 없음 |
| 본문 | `fonts.handBold` | `fonts.hand` |

검토한 대안은 붉은 도장(`palette.stamp`)과 다른 색 종이였다. **둘 다 쓰지 않는다.**

- **붉은 도장** — `palette.stamp`(`#C0392B`)는 design.ts에 예약만 되고 실사용이 0건이라 첫 사용처로 매력적이었지만, 가계부 앱에서 붉은색은 초과를 뜻한다. 공지에 붉은 도장이 찍히면 "중요한 안내"보다 "뭔가 잘못됨"으로 먼저 읽힌다.
- **다른 색 종이** — 스크롤 중 곁눈으로도 잡히지만, 지난 공지가 쌓이면 피드가 얼룩덜룩해진다.

**핵심 근거**: 최신 공지 1건은 어차피 **상단 고정 슬롯**에 있어 위치만으로 이미 구분된다. 스타일 구분이 실제로 필요한 건 흐름 안에 섞이는 지난 공지들이고, 거기서는 조용한 쪽이 오래 간다. 강한 처리는 고정 슬롯이 이미 하는 일을 두 번 치르는 셈이다.

> 테두리 색 `#C6B58B`는 `palette.line`(`#D8C9A0`)보다 두 단계 진하다. 라벨만으로는 흐름 안에서 신호가 약하다고 봐 테두리에 무게를 더 실었다. 토큰 `lineStrong`은 게시판 구현 때 `design.ts`에 함께 추가한다 — 지금 넣으면 소비자 없는 토큰이 된다.

### 6.3 `/room/board/[id]` — 상세 (push)

댓글이 생겨서 상세 화면이 필요해졌다 (댓글 없던 안에서는 뺐던 화면이다).

- 글 전문 + 반응 + 전체 댓글 목록 + **하단 고정 입력줄**.
- 골격은 `expense/[id].tsx`의 댓글 스레드를 따른다 — `KeyboardAvoidingView` + `FlatList` + composer. 키보드 처리는 그 화면이 이미 푼 방식을 그대로 쓴다 (`react-native-keyboard-controller` 인프라는 이미 들어와 있다).
- 삭제된 글로 진입하면 `EmptyState`로 안내하고 목록으로 돌린다. 소식 route가 목록을 가리키므로 이 경로로 오는 딥링크는 없지만, 목록에서 들어간 뒤 다른 기기에서 지워지는 경우가 있다.

### 6.4 작성 — `/room/board/new` (모달)

- `ModalFormScreen` + `Field`(multiline, `maxLength={500}`, 잔여 글자 수) + `PrimaryButton`. `room/edit.tsx`의 폼 구성을 따른다.
- **공지 체크박스는 방장에게만 보인다.** 체크하면 입력 필드 테두리가 `palette.green`으로 바뀌고 placeholder가 "한마디 남기기" → "공지 내용"으로 변한다. 체크 표시만 조용히 켜지면 방장이 잡담을 실수로 전원 알림으로 쏜다 — 공지만 소식을 보내므로 되돌릴 수 없는 실수다.
- 수정도 같은 화면(`?postId=`)을 쓴다. 공지 체크박스는 수정 시 비활성(작성 후 kind 변경 불가).
- 버튼 숨김은 UX일 뿐 보안이 아니다. 실제 거부는 RPC가 한다.

> 게시판형은 작성이 `버튼 → 화면 전환 → 입력 → 저장` 4단계다. 게시판이 죽는 흔한 이유가 이 마찰이므로, 목록이 한산하면 상세 화면의 하단 입력줄처럼 목록 하단에도 인라인 입력줄을 붙이는 게 값싼 보완책이다. 지금 안에서는 넣지 않는다.

### 6.5 라우트 등록

`src/app/_layout.tsx`의 `Stack`에 `room/board`(push) · `room/board/[id]`(push) · `room/board/new`(모달)를 기존 방 라우트 옆에 등록.

---

## 7. 권한 요약

| 행위 | 조건 | 강제 위치 |
|---|---|---|
| 읽기 | 그 방의 멤버십 보유 | RLS |
| 글·댓글 작성 | 활성 멤버 · 방이 `open` | RPC |
| 공지 작성 | **방장** · 방이 `open` | RPC |
| 수정 | 작성자 본인 (공지는 현 방장도) · 버전 일치 | RPC |
| 삭제 | 작성자 본인 **또는 방장** | RPC (소프트) |
| 반응 | 활성 멤버 | RPC |
| 주차 phase 제약 | **없음** | — |

방장의 삭제 권한은 모더레이션용이다. 방장 위임 후에는 새 방장이 승계한다 — 기준이 `author_id`가 아니라 `rooms.owner_id`이기 때문이다.

---

## 8. 안 하는 것

답글(1단계 대댓글) · 댓글 반응 · 이미지 첨부 · 멘션 · 고정 여러 개 · 글 제목 · 글별 읽음 표시 · 신고/차단 UI(`reports`·`blocks` 테이블은 있으나 연결은 별건) · 탭 추가 · 무한 스크롤(최근 200건 고정) · 목록 인라인 작성줄(§6.4 각주).

---

## 9. 파일 목록

| 파일 | 종류 |
|---|---|
| `supabase/migrations/20260818000000_add_room_posts.sql` | 신규 |
| `supabase/README.md` | 수정 (RPC · read model · Notifications) |
| `src/data/types.ts` · `repository.ts` · `supabase-repository.ts` · `offline-queue-repository.ts` | 수정 |
| `src/store/app-store.ts` · `app-indexes.ts` | 수정 |
| `src/providers/app-data-hooks.ts` · `app-actions-provider.tsx` | 수정 |
| `src/components/room/room-board-card.tsx` · `room-board-preview.tsx` | 신규 |
| `src/components/room/room-home-header.tsx` | 수정 |
| `src/app/room/board/index.tsx` · `[id].tsx` · `new.tsx` | 신규 |
| `src/app/notifications.tsx` · `_layout.tsx` | 수정 |
| `src/test/app-snapshot-fixture.ts` | 수정 (배열 3개 추가) |
| `docs/ARCHITECTURE.md` | 수정 (도메인 개념도 · 라우트 표) |

> **DB push는 사용자가 직접** 수행한다. 코드 작업은 마이그레이션 파일 작성까지다.

---

## 10. 검증

- `supabase-repository.test.ts` — 스냅샷이 세 배열을 채우는지, 보이지 않는 방의 글이 걸러지는지, 삭제된 글·댓글이 빠지는지.
- `app-indexes.test.ts` — 참조가 그대로일 때 인덱스가 재사용되는지.
- 수동: ① 방장이 공지 체크 후 작성 → 다른 계정 소식함 배지 ② 일반 글 작성 시 소식이 **가지 않는지** ③ 일반 멤버에게 공지 체크박스가 없는지 ④ 방장이 남의 글을 삭제할 수 있는지 ⑤ 방장 위임 후 새 방장의 권한 승계 ⑥ 댓글 3건 이상일 때 미리보기 2건 + 모두 보기 동작.
- `npm run qa` 통과.
