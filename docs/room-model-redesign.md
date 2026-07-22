# 방(Room) 모델 재설계 — 설계 문서

> 상태: **설계 중 (구현 전)**. 스키마·코드 착수 전에 아래 "열린 결정"을 확정한다.
> 배경: 현재 시스템은 "챌린지 1개 = 1회성" 전제. 이를 **방(상위) + 주차별 챌린지(반복)** 로 재설계한다.
> 유리한 점: 원격 DB에 실데이터가 없어 **데이터 이전 불필요** — 스키마를 자유롭게 다시 짤 수 있다.

## 1. 확정된 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 챌린지 성격 | **평일 전용**. 주말은 선택일·유효일에서 완전히 제외. DatePicker에서 토·일 비활성 |
| 유효일 계산 | `유효일 = 평일 − (평일에 걸린 공휴일)`. 토요일 공휴일 등 이중차감 금지(집합 연산) |
| 한도 공식 | `적용한도 = 기준금액 × 유효일 / 선택일` (예: 기준 5만, 평일5·공휴일1 → 4만) |
| 주차 생성 | **시스템이 매주 자동 생성** (pg_cron) |
| 멤버십 | **방 가입 → 이후 모든 주차 자동 참여** (탈퇴 전까지) |
| 누적 | **주차별 정산 + 누적 통계** (연속 달성·시즌 순위 등) |
| 반복 종료 | **무기한** (방장이 닫을 때까지) |
| 초대 | **방 단위 초대** (챌린지가 아니라 방에 가입) |

## 2. 새 도메인 모델

```
Room (방)                     상위 개념. 고정 설정 + 초대 + 멤버십의 소유자
  ├─ RoomMember               방 멤버십(영속). 방 가입 시 1행, 탈퇴 전까지 유지
  ├─ InviteCode (room 단위)   방 초대 코드
  └─ Period (주차)            매주 자동 생성. 자체 S/E/C/F 타임라인
       ├─ PeriodDay           그 주의 평일 목록 + 공휴일 플래그
       ├─ PeriodMember        그 주차 참여자 + 주차별 적용한도  (RoomMember에서 자동 전개)
       ├─ Expense             지출 → Period 에 연결 (Room 아님)
       │    └─ Comment        지출 댓글 (기존과 동일)
       └─ PeriodResult        주차별 정산 스냅샷 (지출합·잔액·달성·왕관)

RoomMemberStats (뷰)          PeriodResult 를 room×user 로 집계한 누적 통계
```

### 기존 → 신규 매핑

| 기존 | 신규 |
|---|---|
| `challenges` (헤더 + 타임라인) | **`rooms`**(고정 설정) + **`periods`**(주차별 타임라인)로 분리 |
| `challenge_members` | **`room_members`**(영속) + **`period_members`**(주차별 한도)로 분리 |
| `challenge_days` | **`period_days`** (평일만) |
| `invite_codes.challenge_id` | **`invite_codes.room_id`** |
| `expenses.challenge_id` | **`expenses.period_id`** |
| `challenge_archives` / `challenge_member_results` | **`period_results`** + 누적 뷰 |

## 3. 라이프사이클

### 3.1 방 생성
- 방장이 이름·기준금액·(평일 패턴, 기본 월~금)을 설정 → `rooms` 1행 + 방장 `room_members` + 방 초대코드 발급.
- 첫 주차(Period)를 즉시 생성(또는 다음 월요일). → **열린 결정 D6**.

### 3.2 주차 자동 생성 (pg_cron)
- 매주 경계에 방마다 다음 주차를 생성.
- 생성 시 그 주의 **평일 목록**을 만들고, `korean_holidays`(current version)와 조인해 공휴일 표시 → `valid_day_count` 확정.
- 그 시점 **active `room_members` 전원**을 `period_members`로 전개, 각자 `applied_limit` 계산.
- 즉 "챌린지 종료 후 자동 정산"에 더해 "다음 주차 자동 개설"까지 cron이 담당.

### 3.3 단계(phase)
- Period 마다 시각 기반으로 파생: `WAITING → ACTIVE → ADJUSTMENT → SETTLEMENT → ARCHIVED` (기존 `challenge_status_view` 방식 재사용).
- 주차 경계: 기본 월 00:00 KST 시작, 금요일 종료 → S/E/C/F. → **열린 결정 D1**.

### 3.4 정산 + 누적
- 각 Period 의 F 시점에 `PeriodResult` 스냅샷(기존 finalize 로직 재사용).
- `RoomMemberStats` 뷰가 그걸 room×user 로 집계: 참여 주차수·달성 주차수·현재 연속 달성·왕관 횟수 등. → **열린 결정 D4**.

### 3.5 방 닫기
- 방장이 방을 닫으면 이후 주차 생성 중단, 기존 기록은 읽기 전용 보관.

## 4. 스키마 스케치 (초안 — 확정 아님)

```sql
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id),
  base_amount bigint not null,               -- 주당 기준금액
  weekday_mask int not null default 62,      -- 비트마스크(월~금=62), 확장 여지
  timezone text not null default 'Asia/Seoul',
  holiday_version_id text not null references public.holiday_calendar_versions(id),
  status text not null default 'open',        -- open | closed
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.room_members (
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id),
  role text not null default 'member',        -- owner | member
  status text not null default 'active',      -- active | left | removed
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  week_index int not null,                    -- 1,2,3...
  week_start date not null,                    -- 월요일
  week_end date not null,                      -- 금요일
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  correction_ends_at timestamptz not null,
  finalizes_at timestamptz not null,
  selected_day_count int not null,             -- 그 주 평일 수
  valid_day_count int not null,                -- 평일 − 공휴일
  finalized_at timestamptz,
  unique (room_id, week_index)
);

create table public.period_days (
  period_id uuid references public.periods(id) on delete cascade,
  day_on date not null,
  is_holiday boolean not null default false,
  holiday_name text,
  primary key (period_id, day_on)
);

create table public.period_members (
  period_id uuid references public.periods(id) on delete cascade,
  user_id uuid references public.profiles(id),
  applied_limit bigint not null,
  eligible_day_count int not null,
  joined_on date,                              -- 주차 중간 합류 시
  status text not null default 'active',
  primary key (period_id, user_id)
);

-- expenses: challenge_id → period_id 로 교체 (나머지 컬럼 유지)
-- comments: 변경 없음
-- period_results: 기존 challenge_member_results 와 동형, period_id 기준
-- room_member_stats: period_results 집계 뷰
```

## 5. 열린 결정 (구현 전 확정 필요)

각 항목에 **권장 기본값**을 달았다. 별다른 이견이 없으면 이 기본값으로 확정한다.

- **D1. 주차 경계/평일 패턴** — 권장: 월 00:00 ~ 금 24:00 KST 고정(월~금). `weekday_mask`로 확장 여지만 남기고 UI는 월~금 고정.
- **D2. 기준금액 단위** — 권장: **주당** 기준금액, 방 생성 시 고정(모든 주차 동일).
- **D3. 주차 중간 합류** — 권장: 방 가입 시각이 현재 주차 ACTIVE 단계면 **그 주차에 일할(proration) 참여**(기존 late-join 로직 재사용), 아니면 다음 주차부터. (대안: 항상 다음 주차부터 — 더 단순하나 "월요일 가입인데 이번 주 못 함" 발생)
- **D4. 누적 통계 항목** — 권장: 참여 주차수 · 달성 주차수 · **현재 연속 달성(streak)** · 왕관 횟수. 시즌/리그 순위는 추후.
- **D5. 공휴일만 있는 주** — 권장: 그런 주(예: 설·추석 낀 주에 평일이 전부 공휴일)는 `valid_day_count=0` → 그 주차는 "쉬는 주"로 생성하되 결과 집계에서 제외.
- **D6. 첫 주차 시점** — 권장: 방 생성이 평일이고 아직 이번 주 ACTIVE 진입 전이면 이번 주부터, 아니면 다음 주 월요일부터.
- **D7. pg_cron 생성 시점** — 권장: 직전 주차 F(월 00:00)에 다음 주차 생성 + active 멤버 전개.

## 6. 구현 단계 (제안)

되돌리기 어려운 순서대로. 각 단계는 독립 검증.

1. **스키마 마이그레이션(신규)** — rooms/periods/... 생성, expenses.period_id 전환. 기존 challenge* 객체는 제거 또는 대체. → 드라이런 후 push.
2. **RPC 재작성** — create_room / join_room / preview_room_invite / add_expense(period 기준) / 주차 생성·정산 함수 / 누적 뷰.
3. **도메인 로직** — 평일 캘린더(`createWeekdayCalendar`), 주차 타임라인, 한도. 단위테스트.
4. **데이터 계층** — repository/types를 room·period 기준으로 재작성. 오프라인 큐 영향 검토.
5. **화면** — 방 생성/초대/홈(이번 주차)/지출/지난 주차/누적 통계. DatePicker 주말 비활성.
6. **정리** — 하드코딩 공휴일 표 삭제(서버 조회로 대체), 데모 시드 재작성.

## 7. 리스크 / 검토 필요

- **오프라인 큐**: 지출이 period_id에 묶이는데, 오프라인 중 주차가 바뀌면 어느 주차에 귀속되는지 규칙 필요.
- **pg_cron 신뢰성**: 자동 생성이 누락되면 그 주 챌린지가 안 열림 → 보정(수동 생성 fallback) 필요.
- **누적 통계 성능**: 방·주차가 쌓이면 뷰 집계 비용. 필요 시 materialized view.
- **범위**: 이건 현재 코드베이스의 상당 부분을 재작성하는 작업. 기존에 정리해 둔 로직(권한·한도·정산)은 재사용 가능하나 배선은 대부분 새로 짬.
