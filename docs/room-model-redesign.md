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

## 5. 확정된 결정 (D1–D7)

전부 사용자 승인 완료. 스키마·RPC 설계의 기준.

- **D1. 주차 경계/평일 패턴** — 월 00:00 ~ 금 24:00 KST 고정(월~금). `weekday_mask`로 확장 여지만 남기고 UI는 월~금 고정.
- **D2. 기준금액 단위** — **주당** 기준금액(= 일 기준 × 평일수), 방 생성 시 고정(모든 주차 동일).
- **D3. 주차 중간 합류** — 현재 주차가 ACTIVE면 **합류일부터 일할(proration) 참여**. 기존 late-join 로직(`greatest(합류일, 시작일)` 이후 남은 평일 카운트, 오늘 포함)을 `period_days` 기준으로 재사용.
- **D4. 누적 통계 항목** — **연속 달성(streak)** · **누적 달성 주차 수** · **왕관 획득 횟수**. (누적 절약액은 제외 — 추후 필요 시 추가.)
- **D5. 공휴일만 있는 주** — `valid_day_count=0`인 주도 **'쉬는 주'로 생성**하되 누적·streak 계산에서 **제외**(streak이 끊기지 않음).
- **D6. 첫 주차 시점** — 방 생성이 평일이면 이번 주가 이미 ACTIVE여도 **오늘(생성일 포함)부터 일할 시작**. 첫 주차도 "그 주 월~금 전체"로 잡고(선택일=평일수), 방장은 그 주차의 일할 참여자가 됨. 생성이 주말이면 다음 주 월요일부터 full 주차.
- **D7. pg_cron 생성 시점** — 직전 주차 F(월 00:00)에 다음 주차 생성 + 그 시점 active `room_members` 전원을 `period_members`로 전개.

### 파생 결론
- D3·D6이 **동일한 일할 계산 메커니즘**을 공유 → 방장/중간합류 구분 없이 한 경로.
- 첫 주차/중간 주차 모두 period는 항상 "월~금 full week"; 개인별 proration이 mid-week 시작을 처리.
- 한도 = `기준금액 × (합류일 이후 유효 평일) / (그 주 평일수)`. 기존 공식 그대로.

## 5.5 다음 세션 시작점 (구현 착수 상태)

- **D1–D7 전부 확정** (위 §5). 설계 논의 완료, 구현 미착수.
- **마이그레이션 전략: (a) 전면 교체** — 기존 `challenges*` 스키마를 append-only 새 마이그레이션에서 drop하고 room/period로 재구축. (초기 마이그레이션 재작성/원격 리셋은 하지 않음.)
- **원격 DB 상태**: 초기 스키마(`20260710062707_initial_jaringoby_schema.sql`) 배포 완료. 공휴일 시드 45행 적재 완료(`kr-2026-2027`, is_current). 실사용 데이터 없음(테스트 계정 1개 + 프로필 백필만).
- **재사용 가능**: 권한 판정·한도 공식(`base × 유효일/선택일`)·정산(finalize)·phase 계산(`status_view`)·late-join proration 로직. 새로 짜는 건 room/period **구조와 배선**.
- **착수 지점**: §6 1단계 — 새 마이그레이션 파일 작성. 먼저 SQL을 사용자에게 보여 리뷰 → 드라이런 → 사용자가 직접 `db push`. (DB 비밀번호 필요 명령은 assistant가 실행 불가.)
- **이번 세션 커밋 완료**: config/domain/data/providers/ui/screens/backend/docs 8개 커밋(main). push 안 함.

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
