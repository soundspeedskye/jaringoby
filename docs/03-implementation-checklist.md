# 자린고비 구현·정책 검증 체크리스트

- 문서 상태: Implementation Gate v0.1
- 작성일: 2026-07-10
- 대상: iOS / Android Expo 앱, Supabase 백엔드, 운영·QA
- 근거 문서: `docs/01-product-plan.md`, `docs/02-product-policy.md`, 사용자 확정 UI 및 구현 목표
- 현재 판정: **모든 구현 증거 PENDING**

## 1. 목적과 사용 규칙

이 문서는 “코드가 있어 보인다”가 아니라, 기획·정책의 각 요구가 현재 산출물과 실행 결과로 증명됐는지를 추적한다. 구현자는 각 행을 완료할 때 `상태`를 바꾸고 `예상 증거`를 실제 파일, 테스트 이름, 실행 명령과 결과 링크로 교체한다.

판정 규칙:

| 상태 | 의미 |
|---|---|
| `PENDING` | 구현 또는 충분한 검증 증거가 아직 없다. 현재 모든 행의 초기 상태다. |
| `PASS` | 요구를 직접 검증하는 코드·테스트·실행 결과가 모두 있다. |
| `FAIL` | 구현 또는 검증 결과가 요구와 모순된다. |
| `BLOCKED` | 외부 권한·실기기·법무 결정 등 명시적인 차단 사유가 있고 우회 증거가 없다. |
| `N/A` | 범위 제외가 근거 문서에 명시돼 있고 리뷰어가 동의했다. 단순 미구현에는 사용할 수 없다. |

증거 원칙:

1. 파일 존재만으로 `PASS` 처리하지 않는다. 동작을 직접 검증하는 자동 테스트 또는 재현 가능한 수동 QA 결과가 함께 있어야 한다.
2. 프런트엔드에서 버튼을 숨긴 것만으로 정책 구현을 인정하지 않는다. 금액, 권한, 시간 경계, 정원, 불변 조건은 Supabase/RLS/RPC에서도 거부돼야 한다.
3. iOS 결과로 Android 완료를 추정하거나 그 반대로 추정하지 않는다.
4. 성공 경로뿐 아니라 권한 없는 사용자, 정확한 시간 경계, 동시 요청, 오프라인 재전송을 포함한다.
5. 화면 녹화·스크린샷에는 테스트 기기/OS, 앱 커밋, 시각, 계정 역할을 함께 기록한다.
6. 실제 경로가 아래 `예상 증거`와 다르면 이 문서를 실제 경로로 갱신한다. 동등한 증거 없이 경로만 바꾸어 통과시키지 않는다.

## 2. 권위 있는 요구사항과 UI 기준

요구 충돌 시 적용 순서:

1. 사용자가 대화에서 직접 확정한 최신 요구
2. `docs/02-product-policy.md`의 구체적인 권한·계산·경계 정책
3. `docs/01-product-plan.md`의 화면·흐름·MVP 정의
4. 최종 UI 시안 `ui-glass-sheet.html`

시각 기준:

- 최종 시안: `/Users/skye-slogup/.codex/visualizations/2026/07/10/019f49da-7e2b-7b22-ac0e-770f33d298be/ui-glass-sheet.html`
- 조합 기준: 상단은 `ui-refined.html`의 챌린지 요약, 하단은 유리 질감 바텀시트 안의 한도 계산 및 멤버 리스트
- 기본 배경/Primary surface: `#FDF6E3`
- 핵심 요약 카드: 진녹색 바탕, 챌린지명·D-day·원형 진행률·남은 금액·적용한도·합류 설명
- 하단: 드래그 핸들이 있는 반투명 글래스 바텀시트, 계산 근거, `함께하는 멤버` 리스트, 별도의 글래스 하단 탭

구현 전 최종 UI 기준을 저장소에 영속적으로 복사해 `docs/assets/design/challenge-room-glass.*`로 보관하고, 임시 경로 소실 후에도 시각 회귀 기준이 남아야 한다.

## 3. 기대하는 증거 구조와 공통 명령

아래는 기본 증거 위치다. 구현 구조가 달라지면 같은 책임을 가진 실제 경로를 매트릭스에 명시한다.

| 영역 | 기대 경로/명령 |
|---|---|
| 앱 라우트 | `mobile/src/app/**` |
| 디자인 토큰·공통 UI | `mobile/src/constants/theme.ts`, `mobile/src/components/ui/**` |
| 도메인 계산 | `mobile/src/domain/challenges/**`, `mobile/src/domain/expenses/**` |
| Supabase 클라이언트/서비스 | `mobile/src/lib/supabase.ts`, `mobile/src/services/**` |
| 로컬 큐·동기화 | `mobile/src/services/sync/**` |
| 단위/통합 테스트 | `mobile/src/**/*.test.ts(x)` |
| E2E | `mobile/e2e/**` 및 테스트 결과 `artifacts/e2e/**` |
| DB 스키마 | `supabase/migrations/**.sql` |
| DB/RLS/Storage 테스트 | `supabase/tests/**.sql` |
| Edge Function/서버 작업 | `supabase/functions/**`, `supabase/seed.sql` |
| 운영·개인정보 | `docs/operations/**`, `docs/legal/**` |
| 에이전트 리뷰 | `docs/reviews/review-01.md`~`review-03.md`, `docs/04-review-summary.md` |
| 정적 검사 | `cd mobile && npm run lint && npm run typecheck` |
| 단위/통합 | `cd mobile && npm run test:unit -- --run && npm run test:coverage` |
| DB 재현·검증 | `cd mobile && npm run db:reset && npm run test:db && npm run db:lint && npm run db:advisors` |
| 플랫폼 빌드 | `cd mobile && npm run build:ios && npm run build:android` |
| 플랫폼 E2E | `cd mobile && npm run test:e2e:ios && npm run test:e2e:android` |
| 전체 게이트 | `cd mobile && npm run verify` |

위 스크립트는 `mobile/package.json`에 고정하고 락파일을 커밋한다. Supabase CLI 명령은 먼저 `cd mobile && npx supabase --help`로 현재 설치 버전의 형태를 확인한 뒤 스크립트에 고정한다.

## 4. 플랫폼·디자인·공통 UI

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| UI-001 | 하나의 Expo 코드베이스가 iOS와 Android에서 기동하고 주요 라우트가 크래시 없이 열린다. | `mobile/app.json`, `mobile/src/app/_layout.tsx`; `npm run build:ios`, `npm run build:android`; 양 플랫폼 smoke 영상 | PENDING |
| UI-002 | 기본 화면 배경/주요 surface의 primary는 정확히 `#FDF6E3`이며 하드코딩이 아니라 토큰으로 공유한다. | `mobile/src/constants/theme.ts`; `theme.test.ts`; 양 플랫폼 스크린샷 픽셀/시각 회귀 | PENDING |
| UI-003 | 챌린지 방 상단은 최종 시안처럼 챌린지명, D-day, 원형 진행률, 남은 금액, 개인 적용한도, 합류 설명을 한 카드에 표시한다. | `mobile/src/features/challenges/components/ChallengeHero.tsx`; component test; 시안 대비 iOS/Android 스크린샷 | PENDING |
| UI-004 | 진행률 링은 사용/남은 금액을 오해 없이 표현하며 0원 한도, 100% 초과, 음수 잔액에서도 레이아웃이 깨지지 않는다. | `ProgressRing.tsx`; `ProgressRing.test.tsx`의 0/50/100/150% cases; 스크린샷 | PENDING |
| UI-005 | 하단에는 드래그 핸들, 계산 카드, 멤버 리스트가 포함된 최신 글래스 바텀시트가 있고 콘텐츠를 가리지 않도록 스냅/스크롤된다. | `ChallengeMemberSheet.tsx`; 제스처/스크롤 component test; iOS/Android 영상 | PENDING |
| UI-006 | 지원 플랫폼에서는 네이티브 glass 효과, 미지원/저감 투명도 환경에서는 읽기 쉬운 blur/불투명 fallback을 사용한다. | `GlassSurface.tsx`에서 `expo-glass-effect`/`expo-blur` 분기; 플랫폼·접근성 테스트 | PENDING |
| UI-007 | 멤버는 리스트 형식으로 프로필, 닉네임, 최근 지출 요약 또는 합류 상태, 사용/남은 금액을 일관되게 보여준다. | `MemberRow.tsx`; 긴 닉네임·10명·빈 상태 스냅샷 | PENDING |
| UI-008 | 최대 남은 금액의 활성 멤버 닉네임 앞에 `👑`을 표시하고 공동 1위 모두 표시한다. 이모지는 닉네임 데이터 자체를 바꾸지 않는다. | `MemberRow.tsx`, view model test `crown-view-model.test.ts`; 동률 E2E | PENDING |
| UI-009 | 중도 합류자는 `늦게 합류` 배지와 합류일/적용한도를 확인할 수 있다. | `LateJoinBadge.tsx`; join flow E2E | PENDING |
| UI-010 | 글래스 하단 탭은 홈·내 지출·내 정보 3개이며 현재 탭, safe-area, Android gesture inset를 올바르게 처리한다. | `mobile/src/components/app-tabs*`; iPhone/Android gesture nav 스크린샷 | PENDING |
| UI-011 | 진행·보정 상태에는 공통 `+ 지출` 진입점, 정산·완료에는 비활성 또는 제거된 진입점과 이유 안내가 있다. | route state tests; `challenge-state-ui.test.tsx`; E2E | PENDING |
| UI-012 | 키보드, 작은 화면, 큰 화면, 노치/다이내믹 아일랜드, Android system bar에서 입력창·시트·탭이 겹치지 않는다. | iPhone SE/Pro Max 및 소형/대형 Android 캡처; keyboard E2E | PENDING |
| UI-013 | 로딩, 빈 목록, 네트워크 오류, 재시도, 오프라인, 권한 거부, 삭제된 콘텐츠 상태가 모든 데이터 화면에 있다. | 공통 `AsyncState` 컴포넌트; route별 failure tests | PENDING |
| UI-014 | 금액은 KRW 천 단위, 날짜/시각은 `Asia/Seoul`, 한국어 문구로 일관되게 표시한다. | `mobile/src/lib/format.ts`; locale/timezone unit tests | PENDING |
| UI-015 | 앱의 splash/icon/scheme이 자린고비 브랜드로 교체되고 개발 템플릿 콘텐츠가 남지 않는다. | `mobile/app.json`, `mobile/assets/**`; `rg 'Welcome to Expo|expo-logo' mobile/src mobile/app.json` 결과 0 | PENDING |

## 5. 계정·프로필·전역 내비게이션

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| ACC-001 | 기기 변경 후에도 복구 가능한 Supabase Auth 계정 흐름이 있고 선택한 인증 수단과 복구 정책이 문서화돼 있다. | `mobile/src/app/(auth)/**`, `auth-service.ts`, `docs/operations/auth.md`; auth E2E | PENDING |
| ACC-002 | 로그인 세션 복원·만료·로그아웃·탈퇴가 안전하게 동작하며 탈퇴 전 세션을 종료/회수한다. | auth service tests; RLS session tests; 탈퇴 E2E | PENDING |
| ACC-003 | 닉네임은 trim 후 2~20자, 공백만 거부하고 프로필 이미지를 등록/교체할 수 있다. | profile form/schema tests; DB constraint tests | PENDING |
| ACC-004 | 홈은 예정·진행·보정·정산 상태와 지난 챌린지 진입, 만들기, 코드 참여, 알림함을 제공한다. | `mobile/src/app/(tabs)/index.tsx`; 상태별 seeded E2E | PENDING |
| ACC-005 | 내 지출은 수입 전환 없이 일/기간별 지출 목록과 합계를 제공한다. | `mobile/src/app/(tabs)/expenses/**`; aggregate tests | PENDING |
| ACC-006 | 내 정보는 프로필, 전체/방별 알림, 차단·신고, 정책, 탈퇴 진입을 제공한다. | `mobile/src/app/(tabs)/settings/**`; navigation E2E | PENDING |
| ACC-007 | 알림함은 댓글·답글·합류·상태 전환을 정확한 대상 화면으로 deep-link한다. | `notifications/**`, linking config; notification deep-link tests | PENDING |

## 6. 챌린지 생성·초대·참여·멤버 관리

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| CHL-001 | 방 만들기는 이름, 시작/종료일 또는 시작일/기간, 기준금액, 최초 정원을 입력한다. 기간은 양 끝 포함 1~31일이다. | `mobile/src/app/challenges/create.tsx`; form validation tests | PENDING |
| CHL-002 | 오늘·다음 평일(월~금)·7일·직접 선택 프리셋이 정확한 선택일 집합 `A`를 만든다. | `date-presets.ts`; 월경계/연경계 unit tests | PENDING |
| CHL-003 | 만들기 전 전체 선택일, 제외 공휴일, 유효일, 기준금액, 예상 적용한도와 계산식을 미리 보여준다. | `ChallengeCalculationPreview.tsx`; seeded holiday E2E | PENDING |
| CHL-004 | 선택일 전부가 공휴일이면 생성할 수 없고 원인을 보여준다. | domain/DB validation; `all-holidays.test.ts`; E2E | PENDING |
| CHL-005 | 최종 확인에서 “생성 후 기간·기준금액 수정 불가” 동의를 받아야 생성된다. | confirm dialog test; create E2E | PENDING |
| CHL-006 | 생성 성공 시 기간·금액·통화·시간대·선택일·공휴일 데이터 버전/제외일을 원자적으로 스냅샷 고정한다. | create challenge RPC migration; SQL transaction tests | PENDING |
| CHL-007 | 생성 후 방장도 모든 상태에서 기간·기준금액·계산 스냅샷을 수정할 수 없다. | immutable trigger/RLS; owner negative SQL tests; API tamper E2E | PENDING |
| CHL-008 | 시작 전이고 공유 지출이 없을 때만 방장이 삭제할 수 있고 그 외에는 서버가 거부한다. | delete RPC/RLS; waiting/started/has-expense SQL matrix | PENDING |
| CHL-009 | 최초 정원은 방장 포함, 최대 활성 10명이며 방장은 10명 안에서 증가시킬 수 있다. 활성 인원 아래로 감소는 불가하다. | capacity constraint/RPC; concurrency SQL tests; owner UI E2E | PENDING |
| CHL-010 | 대소문자 비구분, 혼동 문자 제외 6자리 코드와 초대 링크를 만든다. 코드 원문은 일반 테이블 조회로 노출되지 않는다. | invite schema/RPC; format/property tests; RLS negative tests | PENDING |
| CHL-011 | 코드/링크는 `WAITING`·`ACTIVE`에서만 유효하고 정확히 `E`부터 만료된다. | invite lookup RPC; boundary SQL tests at `E-ε/E` | PENDING |
| CHL-012 | 방장은 `E` 전 재발급할 수 있고 이전 코드가 즉시 무효가 된다. | rotate RPC transaction test; E2E | PENDING |
| CHL-013 | 잘못된 코드 입력은 값을 보존한 채 안내하고 반복 시도에는 서버 측 속도 제한/일시 차단이 있다. | Edge Function/RPC rate limit; abuse integration test | PENDING |
| CHL-014 | 참여 전 방명·기간·기준금액·날짜·공휴일·인원/정원·합류일·남은 유효일·한도 계산식·피드 공개 범위를 보여준다. | join preview DTO/screen; UI test | PENDING |
| CHL-015 | 같은 계정은 같은 방에 한 번만 참여하며 나간 뒤 재가입할 수 없다. | unique membership/history constraint; SQL negative tests | PENDING |
| CHL-016 | 마지막 한 자리를 동시 요청하면 서버 트랜잭션/락으로 정확히 한 명만 성공한다. | join RPC; parallel integration test ≥20 requests | PENDING |
| CHL-017 | 진행 중 합류가 가능하되 `E` 이후 또는 남은 유효일 0일이면 거부한다. | join RPC boundary tests; E2E | PENDING |
| CHL-018 | 합류 확정은 서버 시각을 사용하며 합류일이 공휴일이면 그 날을 `R_i`에 포함하지 않는다. | calculation/join SQL tests | PENDING |
| CHL-019 | 새 합류자의 닉네임·합류일·적용한도를 기존 멤버에게 실시간/알림으로 전달한다. | membership Realtime subscription; multi-client E2E | PENDING |
| CHL-020 | 진행 중 나갈 수 있으나 기록은 `나간 참여자`로 남고 왕관/전체 완주에서 제외된다. | membership status RPC; result tests; UI E2E | PENDING |
| CHL-021 | 방장 이탈 전 활성 멤버에게 권한을 넘겨야 하며 탈퇴 시 가장 먼저 참여한 활성 멤버로 자동 승계한다. | transfer/leave RPC; deterministic SQL tests | PENDING |
| CHL-022 | 강제 퇴장/계정 탈퇴 상태도 기록을 보존하고 왕관·전체 완주 분모에서 제외한다. | membership state tests; archived view E2E | PENDING |

## 7. 적용한도·합계·왕관 계산

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| CAL-001 | `A`는 선택한 포함 날짜 집합, `N=|A|`, `H`는 생성 시 공휴일 스냅샷, `D=A-H`로 일관되게 계산한다. | `calculation.ts`와 DB 함수의 동일 golden vectors | PENDING |
| CAL-002 | 참여자 `R_i`는 `D` 중 방 시간대 합류일 이상 날짜 수이며 시작 전 참여자는 전체 `D`를 사용한다. | unit/SQL parity test | PENDING |
| CAL-003 | `L_i=floor(B×R_i÷N)`을 KRW 정수 연산으로 처리해 부동소수점 오차가 없다. | property-based unit test, SQL overflow test | PENDING |
| CAL-004 | 5일·50,000원·공휴일 없음·시작 전 참여는 50,000원이다. | golden unit/SQL/E2E case | PENDING |
| CAL-005 | 5일·50,000원·공휴일 1일·시작 전 참여는 40,000원이다. | golden unit/SQL/E2E case | PENDING |
| CAL-006 | 5일·50,000원·수요일 합류·공휴일 없음은 30,000원이다. | golden unit/SQL/E2E case | PENDING |
| CAL-007 | 수요일 합류 후 남은 날짜 중 공휴일 1일이면 20,000원이다. | golden unit/SQL/E2E case | PENDING |
| CAL-008 | 공휴일은 분자에서만 제외하고 분모 `N`은 그대로 유지한다. 생성 후 새 임시공휴일도 기존 방을 바꾸지 않는다. | snapshot mutation regression SQL test | PENDING |
| CAL-009 | 직접 선택 기간은 주말도 `A`에 포함하며 공휴일만 제외한다. 다음 평일 프리셋만 월~금 5일이다. | weekend/holiday unit tests | PENDING |
| CAL-010 | 합류일을 포함하되 서버 확정 시각 이전 발생 지출은 연결할 수 없다. 같은 달력 날짜의 전/후 시각을 구분한다. | expense validation SQL tests around join timestamp | PENDING |
| CAL-011 | `X_i`는 유효 조건 7개를 모두 충족하는 한 레코드의 합이며 개인 기록과 피드에 복제 집계하지 않는다. | aggregate query; duplicate reference SQL tests | PENDING |
| CAL-012 | `M_i=L_i-X_i`, 달성은 `X_i≤L_i`, 초과는 `X_i>L_i`; 초과도 입력 가능하고 음수 잔액/100% 초과를 표시한다. | calculation/UI tests | PENDING |
| CAL-013 | `L_i=0`이면 진행률 나눗셈 오류 없이 0원 안내, 1원부터 초과를 표시한다. | zero-limit unit/UI tests | PENDING |
| CAL-014 | 왕관 비교는 활성 멤버의 부호를 유지한 실제 원화 남은 금액 `M_i` 최대값이며 모두 음수여도 최대값, 동률은 전원이다. `abs(M_i)`는 사용하지 않는다. | crown unit/SQL tests including negative/tie | PENDING |
| CAL-015 | 진행·보정 중 확정 지출/수정/삭제/합류/이탈마다 왕관을 재계산하고 `C`에서 잠정 고정, `F`에서 최종 스냅샷으로 확정한다. | multi-client E2E; snapshot SQL test | PENDING |
| CAL-016 | 전체 완주는 `F` 시점 유효 활성 참여자 전원이 개인 달성일 때만 true다. | result SQL tests with exited/kicked members | PENDING |
| CAL-017 | 모바일 계산 미리보기와 서버 확정 계산은 같은 fixture에서 항상 동일하다. 서버 결과가 최종 권위다. | shared JSON vectors; client/SQL parity gate | PENDING |

## 8. 지출·사진·개인 기록

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| EXP-001 | 지출 필드는 양의 KRW 정수 금액, 발생 시각, 6개 고정 카테고리, 메모, 사진, 연결 방, 작성자, 생성/수정/동기화 상태다. | domain schema + DB constraints; validation tests | PENDING |
| EXP-002 | 카테고리는 `점심`, `커피`, `간식`, `저녁`, `필수품`, `사치품`만 UI/API/DB에 저장된다. 기타·사용자 정의는 거부한다. | enum/check constraint; 6-value tests; invalid API test | PENDING |
| EXP-003 | 수입 화면, 수입 타입, 수입 API, 수입 기반 잔액 계산이 존재하지 않는다. | schema/API audit; `rg -i 'income|수입' mobile/src supabase` 수동 판독 | PENDING |
| EXP-004 | 방에서 등록하면 해당 방이 자동 선택되고 사진→금액→카테고리→메모→발생 일시 순으로 입력한다. | expense form UI; E2E | PENDING |
| EXP-005 | 챌린지 지출은 정확히 사진 1장이 없으면 제출 불가하며 다중 사진도 거부한다. 개인 전용 지출의 사진 정책은 명시적으로 구현/문서화한다. | form + DB/storage relation cardinality tests | PENDING |
| EXP-006 | 카메라와 앨범 선택, 권한 요청/거부 안내, 미리보기·교체가 양 플랫폼에서 동작한다. | app permissions, image picker component; device E2E | PENDING |
| EXP-007 | 업로드 전 EXIF 위치 등 불필요한 메타데이터를 제거하고 민감정보/캡처 위험을 안내한다. | image preprocessing test with fixture EXIF; privacy UI capture | PENDING |
| EXP-008 | 발생 시각은 `[S,E)`이고 날짜가 `D`, 시각이 합류 확정 이상인 경우에만 방에 연결된다. 공휴일 지출은 개인 기록만 가능하다. | server validation SQL matrix; E2E | PENDING |
| EXP-009 | 진행·보정에서 작성자만 자기 지출을 등록·수정·삭제하며 방장도 타인 지출 금액을 못 바꾼다. | RLS owner/non-owner tests | PENDING |
| EXP-010 | 금액·일시·사진·카테고리 변경은 `수정됨`과 서버 수정 시각을 표시한다. | audit columns/UI test | PENDING |
| EXP-011 | 정확히 `C`부터 등록·수정·삭제·사진 재업로드가 서버에서 차단되고 결과가 바뀌지 않는다. | boundary SQL/API tests `C-1ms/C/C+1ms` | PENDING |
| EXP-012 | 삭제는 합계에서 한 번만 제외되며 정산 이후 운영 정정 외에는 변경되지 않는다. | soft-delete/aggregate tests; admin audit test | PENDING |
| EXP-013 | 내 기록과 방 피드는 같은 expense ID를 참조하며 한 번만 저장·집계된다. | unique/idempotency constraints; E2E record ID evidence | PENDING |
| EXP-014 | 환불 별도 유형은 없고 `C` 전 수정/삭제만 허용한다. `C` 이후 환불은 완료 결과를 재계산하지 않는다. | schema absence + policy integration test | PENDING |
| EXP-015 | 목록은 서버 게시 시각 최신순, 실제 발생 시각은 별도로 표시하며 페이지네이션한다. | query/index + pagination tests | PENDING |

## 9. 댓글·인용 답글·실시간 피드백

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| COM-001 | 방 구성원은 합류 전 기록을 포함해 같은 방 피드 전체를 보고 비구성원/다른 방은 볼 수 없다. | RLS membership tests; cross-room E2E | PENDING |
| COM-002 | 지출 상세는 다른 사람 왼쪽, 내 메시지 오른쪽의 채팅형 댓글 UI를 사용한다. | `CommentThread.tsx`; visual regression | PENDING |
| COM-003 | 댓글 본문은 trim 후 1~500자이며 서버에서도 검증한다. | form/DB constraint tests | PENDING |
| COM-004 | 진행·보정·정산에서 댓글/답글 작성, 본인 댓글 5분 내 수정과 완료 전 소프트 삭제가 가능하다. 정확한 경계를 서버가 검사한다. | RLS/RPC time tests; E2E | PENDING |
| COM-005 | 정확히 `F`부터 신규 댓글/수정이 잠기고 읽기 전용이다. 개인정보 삭제 요청은 본문만 자리표시자로 바꾼다. | boundary SQL tests; archived E2E | PENDING |
| COM-006 | 댓글 길게 누르기는 답글·복사·신고와 본인인 경우 수정·삭제 메뉴를 연다. | long-press gesture E2E iOS/Android | PENDING |
| COM-007 | 답글 대상은 입력창 위 읽기 전용 인용 칩이며 원문을 본문에 복사하지 않는다. 취소 가능하다. | composer component tests; E2E | PENDING |
| COM-008 | 답글은 정확히 하나의 원문을 참조하는 1단계 구조다. 답글에 답해도 부모의 부모로 중첩 UI를 만들지 않는다. | DB parent constraint/domain tests | PENDING |
| COM-009 | 인용 칩을 누르면 원문으로 이동하고 삭제 원문은 `삭제된 메시지에 대한 답글`로 표시한다. | virtual list navigation test; deleted parent E2E | PENDING |
| COM-010 | 새 지출·댓글·답글·멤버 변화가 정상 네트워크에서 수 초 내 구독 사용자에게 반영된다. | Supabase Realtime multi-client latency test and log | PENDING |
| COM-011 | 전송 중/성공/실패와 재시도를 표시하고 연결 복구 후 누락 메시지를 서버 순서로 backfill한다. | offline/reconnect integration test | PENDING |
| COM-012 | 타이핑, 온라인 상태, 메시지별 읽음 확인, 방 전체 채팅, 1:1 메시지는 제공하지 않는다. | route/schema audit; negative UI test | PENDING |

## 10. 시간 생명주기·보정·정산·보관

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| STA-001 | 모든 판정은 서버 시각과 `Asia/Seoul`을 사용하고 기기 시간 변경이 권한/결과를 바꾸지 않는다. | DB functions/RPC; manipulated-device-clock E2E | PENDING |
| STA-002 | `S=시작일 00:00`, `E=종료일 다음 날 00:00`, `C=E+12h`, `F=E+48h`, 챌린지 기간은 `[S,E)`다. | `challenge-state.ts`, SQL function; shared boundary vectors | PENDING |
| STA-003 | `t<S` 대기: 참여 가능, 챌린지 지출 불가, 기존 댓글 스레드 없음. | UI/RLS tests | PENDING |
| STA-004 | `S≤t<E` 진행: 참여 및 지출 CRUD, 댓글 작성·5분 내 수정/삭제 가능. | boundary integration tests | PENDING |
| STA-005 | `E≤t<C` 보정: 참여 불가, 기간 내 지출 CRUD/사진 재업로드, 댓글 가능. 남은 시간을 표시한다. | boundary integration/E2E | PENDING |
| STA-006 | `C≤t<F` 정산 36시간: 지출 조회만, 댓글 작성·5분 내 수정/삭제, 잠정 왕관/결과 표시. | RLS/time-travel E2E | PENDING |
| STA-007 | `F≤t` 완료: 지출·댓글 읽기 전용, 개인정보 본문 삭제 요청만 별도 경로로 가능하다. | RLS/admin function tests | PENDING |
| STA-008 | 월~금 방은 토 00:00 보정, 토 12:00 지출 잠금, 월 00:00 완료로 전환한다. | canonical Seoul-time golden test | PENDING |
| STA-009 | 상태 경계는 겹침/공백이 없고 `S/E/C/F` 정확한 순간의 요청을 일관되게 승인/거부한다. | property/boundary SQL tests | PENDING |
| STA-010 | 상태 전환이 앱 미실행에도 서버에서 결정되고 푸시/스냅샷 작업은 재시도 가능하며 중복 실행돼도 결과가 같다. | cron/queue/function implementation; idempotency integration test | PENDING |
| STA-011 | 정산 중 서버 장애 정책(모두 동일 연장 또는 판정 보류)을 선택·문서화하고 일부 사용자에게만 다른 경계를 적용하지 않는다. | `docs/operations/settlement-incidents.md`; failure drill | PENDING |
| STA-012 | `F`에 같은 방을 복제/삭제하지 않고 `ARCHIVED`로 전환해 원본 ID를 유지한다. | finalize transaction SQL test | PENDING |
| STA-013 | 완료 스냅샷은 방 조건, `C/F`, 공휴일 버전/제외일, 멤버별 합류/한도/사용/잔액/달성/왕관을 원자적으로 저장한다. | snapshot schema/function tests | PENDING |
| STA-014 | 지난 챌린지는 연·월 그룹, 이름 검색, 참여/달성 필터, 숨기기/다시 표시를 지원한다. 숨김은 다른 사용자 기록을 삭제하지 않는다. | history routes/queries; two-user E2E | PENDING |
| STA-015 | 상세는 방·계산 근거·지출·사진·댓글·삭제 표식·결과를 읽기 전용으로 계속 열람한다. 자동 만료가 없다. | archived seeded E2E; retention schema audit | PENDING |
| STA-016 | 사진은 목록 썸네일, 상세 최적화 원본 지연 로딩, 긴 지출/댓글/방 목록은 페이지 단위 로딩한다. | storage transform/pagination performance tests | PENDING |

## 11. 알림·안전·개인정보·운영

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| OPS-001 | 시작 10분 전/시작, 합류/정원 마감, 내 지출 댓글/내 댓글 답글, 한도 50/80/100%, 업로드 실패, `E`, `C-2h`, `C`, `F` 알림이 중복 없이 생성된다. | notification job/functions; event fixture tests | PENDING |
| OPS-002 | 왕관 변경마다 푸시하지 않으며 전체·방별 알림을 끌 수 있다. | preference/RLS tests; notification negative test | PENDING |
| OPS-003 | 지출 사진·메모·댓글·프로필을 지정 사유로 신고할 수 있고 신고자 정보가 멤버/피신고자에게 노출되지 않는다. | report schema/UI/RLS tests | PENDING |
| OPS-004 | 같은 방 차단 시 계산에 필요한 금액/상태는 유지하되 사진·댓글을 흐림 처리할 수 있다. 콘텐츠 노출과 금융 계산 상태를 분리한다. | block view model/aggregate tests; two-user E2E | PENDING |
| OPS-005 | 개인 전용 지출은 본인만, 방 연결 지출·한도·댓글은 해당 방 권한자만, 로그인/기기 정보는 타인에게 공개되지 않는다. | comprehensive RLS matrix | PENDING |
| OPS-006 | 개인정보 삭제 요청은 사진·메모·댓글 본문을 실제 제거하고 자리표시자/비식별 결과·답글 구조만 유지한다. | erasure function/storage deletion test; audit log | PENDING |
| OPS-007 | 운영자 도구는 방/멤버/계산/공휴일/콘텐츠 ID, 신고, 제한, 감사 로그, 상태/업로드/Realtime/알림 실패를 조회·처리한다. | `docs/operations/admin.md`, admin routes/functions; role tests | PENDING |
| OPS-008 | 운영자의 개인 전용 지출 접근은 기본 차단하고 예외 접근에 사유·주체·시각 감사 로그가 남는다. | admin RLS/audit SQL tests | PENDING |
| OPS-009 | 대상 연령, 이용약관, 개인정보 처리방침, 사진/공유/스크린캡처 고지, 백업 삭제 주기, 신고 처리/이의제기 절차를 출시 전에 확정한다. | `docs/legal/**`; product/legal approval record | PENDING |
| OPS-010 | 핵심 성공/품질 지표 이벤트는 개인정보 최소 수집으로 정의되고 중복 이벤트를 제거한다. | `docs/operations/analytics.md`, analytics event tests | PENDING |

## 12. Supabase 데이터·보안·Realtime·Storage

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| SUP-001 | profiles, challenges, selected/holiday days, memberships, invites, expenses, media, comments, snapshots, notifications, hidden rooms, reports/blocks, idempotency/audit 구조가 마이그레이션으로 재현된다. | `supabase/migrations/**`; clean `npm run db:reset` | PENDING |
| SUP-002 | 공개 스키마의 모든 테이블에 RLS가 활성화되고 Data API GRANT와 RLS를 별개로 명시한다. 권한이 필요 없는 객체는 revoke한다. | catalog assertion SQL tests | PENDING |
| SUP-003 | 클라이언트에는 publishable/anon 키만 있고 `service_role`/secret이 번들·로그·저장소에 없다. | secret scan + production bundle scan | PENDING |
| SUP-004 | 권한 판정에 사용자 수정 가능한 `user_metadata`를 쓰지 않는다. 역할이 필요하면 `app_metadata` 또는 DB 권한 테이블을 사용한다. | SQL/source audit test | PENDING |
| SUP-005 | RLS는 `TO authenticated`만으로 끝나지 않고 소유자/방 멤버/역할/상태 조건을 `USING`·`WITH CHECK`에 함께 둔다. UPDATE에는 SELECT 정책도 있다. | positive/negative pgTAP matrix | PENDING |
| SUP-006 | 비멤버, 다른 방 멤버, 이탈/차단/강퇴 멤버의 읽기·쓰기 권한을 정책별로 명시하고 코드 추측만으로 기록을 못 본다. | 다중 사용자 RLS test fixtures | PENDING |
| SUP-007 | 기간·금액 불변, 지출/댓글 시간 경계, 작성자, 정원은 클라이언트 payload가 아니라 서버 `now()`와 DB 조건으로 강제한다. | RPC/trigger tamper tests | PENDING |
| SUP-008 | 함수는 기본 `SECURITY INVOKER`다. 불가피한 `SECURITY DEFINER`는 비노출 스키마, 고정 `search_path`, `auth.uid()` 검사, PUBLIC execute revoke, 최소 GRANT를 갖는다. | function catalog/security tests; DB advisor 0 critical | PENDING |
| SUP-009 | Postgres view는 `security_invoker=true`이거나 anon/authenticated 접근을 revoke한 비노출 view다. | view catalog test | PENDING |
| SUP-010 | 초대 참여와 정원 증가는 단일 트랜잭션/행 잠금으로 경쟁 상태를 막고 membership unique 제약을 가진다. | concurrent join test | PENDING |
| SUP-011 | DB는 6개 카테고리, 양의 정수 금액, 댓글 길이, 날짜 범위, 하나의 부모 답글, 고유 idempotency key 등 불변식을 제약한다. | constraint violation SQL tests | PENDING |
| SUP-012 | 서버 생성/수정 시각과 일련번호를 사용하며 Realtime 수신 순서가 뒤바뀌어도 결정적으로 정렬/병합한다. | ordering integration tests | PENDING |
| SUP-013 | Realtime 채널은 인증된 방 멤버의 필요한 테이블/행만 구독하고 로그아웃·방 이동 시 해제한다. 재연결 후 delta/backfill한다. | channel service tests; two-room leakage test | PENDING |
| SUP-014 | private Storage bucket을 사용하고 객체 경로는 사용자/방/지출 소유 관계를 검증한다. public URL로 원본을 노출하지 않는다. | storage migration/policies; signed URL tests | PENDING |
| SUP-015 | Storage 정책은 업로드/읽기/교체/삭제 각각 소유·방·상태를 검사한다. upsert 사용 시 INSERT+SELECT+UPDATE 모두 검증한다. | storage RLS SQL/integration matrix | PENDING |
| SUP-016 | 허용 MIME, 최대 크기, 이미지 디코딩, 정확히 1장, 썸네일 생성과 악성/위장 파일 거부를 서버가 확인한다. | upload Edge Function; fixture tests | PENDING |
| SUP-017 | 사진 교체·지출 삭제·개인정보 삭제에서 orphan 객체가 남지 않고, 감사/복구 정책에 맞게 원본·썸네일을 처리한다. | storage lifecycle integration test | PENDING |
| SUP-018 | 조회 경로에 방/상태/멤버/expense/comment 시간순 페이지네이션 인덱스가 있고 N+1·무제한 목록을 피한다. | migration indexes; `EXPLAIN` fixtures | PENDING |
| SUP-019 | 상태 확정·알림·썸네일 같은 서버 작업은 실패 재시도, dead-letter/관측, 중복 실행 안전성을 갖는다. | function tests + operations runbook | PENDING |
| SUP-020 | 인증/DB/Storage/Realtime 의존성 버전을 고정하고 lockfile을 커밋한다. Supabase changelog·공식 문서 기준으로 구현 시점 breaking change를 확인한다. | exact package versions, `package-lock.json`, review note | PENDING |
| SUP-021 | 로컬 재구축 후 스키마·seed·테스트가 순서 독립적으로 통과하고 lint/advisor의 security/performance 경고를 해결하거나 근거 있게 면제한다. | `npm run db:reset/test:db/db:lint/db:advisors` 로그 | PENDING |

## 13. 오프라인·동시성·멱등성·복구

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| SYN-001 | 지출/사진/댓글 요청마다 안정적인 client request ID를 생성하고 DB unique 제약으로 연속 탭·재전송을 한 건으로 만든다. | sync queue + SQL unique tests; rapid-tap E2E | PENDING |
| SYN-002 | 로컬 큐는 앱 종료/재시작 후 보존되고 pending/업로드 중/성공/실패를 표시한다. | AsyncStorage queue tests; kill/relaunch device E2E | PENDING |
| SYN-003 | 미동기화 지출은 본인 임시 합계에 명확히 구분해 표시하고 서버 공식 합계·왕관에는 포함하지 않는다. | optimistic view model tests; two-client E2E | PENDING |
| SYN-004 | 네트워크 복구 후 지수 backoff로 재시도하되 같은 요청 ID를 유지하고 중복 지출/댓글/알림을 만들지 않는다. | offline proxy integration test | PENDING |
| SYN-005 | `C` 전에 서버가 수신·검증하지 못한 지출/사진 변경은 결과에 포함하지 않고 `C`의 미완료 업로드를 실패로 종결한다. | fake-clock + interrupted upload E2E | PENDING |
| SYN-006 | `C` 이후 큐 재시도는 결과를 바꾸지 않고 실패 이유, 내용 복사/문의 경로를 제공한다. | boundary offline E2E | PENDING |
| SYN-007 | 여러 기기에서 같은 지출 수정 시 버전/ETag 기반 충돌을 감지하고 무조건 last-write로 덮지 않으며 사용자 선택을 제공한다. | CAS DB test; two-device E2E | PENDING |
| SYN-008 | Realtime 이벤트 누락/중복/역순을 ID·서버 버전으로 병합하고 재연결 시 페이지 backfill한다. | deterministic sync reducer property tests | PENDING |
| SYN-009 | 마지막 정원, 코드 재발급, 왕관 재계산, 최종 스냅샷의 동시 요청에도 한 번의 확정 결과만 남는다. | parallel DB integration suite | PENDING |
| SYN-010 | 서버 5xx, Storage 실패, 앱 강제 종료, 토큰 만료 각각에서 데이터 손실·권한 우회 없이 복구한다. | fault-injection matrix and artifacts | PENDING |

## 14. 접근성·프라이버시·품질

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| A11Y-001 | 모든 아이콘 버튼, 진행률, 왕관, 프로필, 시트 핸들, 탭에 한국어 접근성 이름·역할·상태·힌트가 있다. | component tests; VoiceOver/TalkBack audit | PENDING |
| A11Y-002 | 왕관/진행/성공/실패를 색이나 이모지만으로 전달하지 않고 텍스트 의미를 함께 제공한다. | accessibility snapshot + manual audit | PENDING |
| A11Y-003 | 본문/보조 텍스트/글래스 surface가 WCAG AA 대비를 충족하며 투명도 저감 모드에서도 읽힌다. | contrast report for all tokens/states | PENDING |
| A11Y-004 | 터치 대상은 최소 44×44pt 수준, 요소 간 간격을 확보하고 long-press 답글에 접근성 대체 액션을 제공한다. | layout assertions; Switch Control/TalkBack menu QA | PENDING |
| A11Y-005 | Dynamic Type/Android font scale 200%에서 정보 잘림·겹침 없이 시트/리스트가 스크롤된다. | large-text screenshots both platforms | PENDING |
| A11Y-006 | Reduce Motion에서 불필요한 애니메이션을 줄이고 진행률/시트 전환이 멀미를 유발하지 않는다. | reduced-motion platform QA | PENDING |
| A11Y-007 | 키보드 포커스 순서, 오류 연결, 입력 라벨, 금액 키보드, 댓글 작성/취소가 스크린리더에서 이해 가능하다. | form accessibility tests/manual recording | PENDING |
| A11Y-008 | 카메라·사진 권한은 사용 시점에 목적을 설명하고 거부/제한/설정 복귀 경로를 제공한다. | app config permission copy; device QA | PENDING |
| A11Y-009 | 민감한 사진/메모가 알림 preview, 오류 로그, analytics, crash report에 원문으로 남지 않는다. | log/network inspection report | PENDING |
| A11Y-010 | 10명·수백 지출·수천 댓글·장기 보관 목록에서도 초기 렌더/스크롤/메모리가 기준을 충족한다. | performance budget 문서와 양 플랫폼 profiling | PENDING |

## 15. 범위 제외 회귀 방지

| ID | 요구사항 / 수용 기준 | 예상 구현·검증 증거 | 상태 |
|---|---|---|---|
| NEG-001 | 은행·카드 자동 연동, 송금·결제, 현금성 보상·벌금이 없다. | route/dependency/schema audit | PENDING |
| NEG-002 | 공개 방 검색/불특정 매칭, 숫자 전체 순위표가 없다. 왕관만 제공한다. | UI/API audit | PENDING |
| NEG-003 | 다중 사진, OCR, 사용자 카테고리, 반복 챌린지, 다중 통화, 공동 예산은 MVP에 없다. | schema/UI audit and negative API tests | PENDING |
| NEG-004 | 사진을 구매 진위 증빙으로 판정하거나 보증하는 문구/자동 판정이 없다. | copy/model/service audit | PENDING |

## 16. 자동·수동 QA 게이트

| ID | 게이트 / 통과 조건 | 예상 실행 증거 | 상태 |
|---|---|---|---|
| QA-001 | 설치가 깨끗한 환경에서 lockfile 그대로 재현되고 의존성 취약점/라이선스 검토가 기록된다. | `npm ci`, dependency audit report | PENDING |
| QA-002 | ESLint와 TypeScript가 오류 0으로 통과한다. | `npm run lint`, `npm run typecheck` 로그 | PENDING |
| QA-003 | 도메인 계산·상태·동기화·UI 단위 테스트가 모두 통과하고 핵심 도메인 branch coverage 기준을 문서화해 충족한다. | `npm run test:unit -- --run`, coverage HTML | PENDING |
| QA-004 | 빈 DB부터 모든 migration/seed/pgTAP/RLS/Storage 테스트가 통과한다. | `npm run db:reset`, `npm run test:db` 로그 | PENDING |
| QA-005 | DB lint/advisor의 security/performance 오류 0, 면제는 항목별 근거와 리뷰 승인이 있다. | `npm run db:lint`, `npm run db:advisors` | PENDING |
| QA-006 | iOS release-equivalent export/build가 경고 정책 안에서 성공한다. | `npm run build:ios` artifact/log | PENDING |
| QA-007 | Android release-equivalent export/build가 경고 정책 안에서 성공한다. | `npm run build:android` artifact/log | PENDING |
| QA-008 | iOS 신규 사용자 E2E: 가입→프로필→생성→초대→지출→사진→댓글/답글→보정→정산→지난 기록을 완주한다. | `npm run test:e2e:ios`; 영상/trace | PENDING |
| QA-009 | Android에서 QA-008과 같은 전체 흐름을 독립 수행한다. | `npm run test:e2e:android`; 영상/trace | PENDING |
| QA-010 | 방장·시작 전 멤버·수요일 중도 합류자·비멤버 4계정으로 금액/공휴일/권한/피드 공개 범위를 검증한다. | multi-account E2E artifact | PENDING |
| QA-011 | `S/E/C/F` fake clock 경계와 기기 시간 조작을 양 플랫폼/API/DB에서 검증한다. | boundary suite logs | PENDING |
| QA-012 | 오프라인 지출 사진 업로드, 댓글, 앱 종료, 복구, `C` 초과를 network conditioning으로 검증한다. | offline E2E matrix | PENDING |
| QA-013 | 동시 마지막 자리 참여, 연속 탭, 여러 기기 수정, 중복 Realtime을 부하/경쟁 테스트한다. | concurrency report | PENDING |
| QA-014 | 비멤버/다른 방/타인 작성자/완료 상태/변조 JWT payload의 모든 읽기·쓰기가 실패하는 보안 음성 테스트가 있다. | RLS/API security report | PENDING |
| QA-015 | 최종 글래스 UI를 iOS/Android 주요 크기에서 시안과 비교하고 승인된 차이를 문서화한다. | visual regression diff in `artifacts/visual/**` | PENDING |
| QA-016 | VoiceOver·TalkBack·큰 글자·대비·Reduce Motion 수동 QA를 각 플랫폼에서 통과한다. | accessibility checklist/video | PENDING |
| QA-017 | 카메라/앨범 권한 허용·거부·제한, EXIF 제거, 민감정보 고지를 실기기에서 검증한다. | privacy QA report | PENDING |
| QA-018 | deep link/참여 링크/푸시 cold start, background, foreground를 iOS/Android에서 검증한다. | linking matrix | PENDING |
| QA-019 | 10명 및 대용량 seed에서 스크롤, 페이지네이션, 이미지 지연 로딩, Realtime 지연이 품질 기준을 충족한다. | performance report | PENDING |
| QA-020 | 전체 `npm run verify`가 수정되지 않은 clean worktree 커밋에서 통과하며 결과 해시를 남긴다. | CI/local final log + commit SHA | PENDING |

## 17. 전체 사용자 플로우 수동 QA 시나리오

각 시나리오는 iOS와 Android에서 별도 실행하며, 실패하면 수정 후 처음부터 재실행한다.

| 시나리오 | 준비/행동 | 반드시 확인할 결과 | 상태 |
|---|---|---|---|
| FLOW-01 | 새 방: 월~금, 50,000원, 공휴일 없음, 정원 3명 생성 | 미리보기 50,000원, 조건 불변, 코드/링크 생성 | PENDING |
| FLOW-02 | 같은 조건에서 목요일 공휴일 스냅샷으로 생성 | 시작 전 한도 40,000원, 목요일 지출 연결 거부 | PENDING |
| FLOW-03 | 방장/멤버가 지출 사진과 6개 카테고리를 등록 | 내 기록·피드 동일 ID 1건, 합계/왕관 실시간 반영 | PENDING |
| FLOW-04 | 수요일에 세 번째 멤버 합류 | 30,000원, 늦게 합류 배지, 합류 시각 이전 지출 거부 | PENDING |
| FLOW-05 | 수요일 이후 목요일 공휴일이 있는 방에 합류 | 20,000원으로 자동 계산 | PENDING |
| FLOW-06 | 댓글 길게 누르고 답글, 취소, 실패/재시도, 원문 삭제 | 인용 칩/1단계/원문 이동/삭제 표식/중복 없음 | PENDING |
| FLOW-07 | 두 명의 남은 금액을 동률 및 모두 초과 상태로 만듦 | 공동 왕관, 모두 음수여도 가장 큰 잔액에게 왕관 | PENDING |
| FLOW-08 | 토 00:00~12:00 보정 중 누락 금요일 지출 수정 | 허용되고 계산 반영, 신규 합류 불가 | PENDING |
| FLOW-09 | 토 12:00 정산 경계에서 지출 수정과 댓글 작성 | 지출 서버 거부, 댓글 허용, 잠정 왕관 | PENDING |
| FLOW-10 | 월 00:00 완료 후 같은 동작 | 지출/댓글 읽기 전용, 지난 목록/검색/필터/상세 열람 | PENDING |
| FLOW-11 | 완료 방 숨기기 후 다른 멤버 계정으로 조회 | 본인 목록에서만 숨고 공유 기록은 유지 | PENDING |
| FLOW-12 | 네트워크 차단 후 지출+사진/댓글, 앱 종료, 경계 전후 복구 | 상태 표시, 경계 전 1회 반영, 경계 후 실패·결과 불변 | PENDING |
| FLOW-13 | 방장 삭제/기간 변경/타인 지출 변경을 UI와 직접 API로 시도 | 정책에 따라 모두 거부되고 감사 가능한 오류 표시 | PENDING |
| FLOW-14 | 신고·차단·개인정보 본문 삭제를 두 계정으로 수행 | 노출만 제한, 합계/스레드 구조/비식별 결과 유지 | PENDING |

## 18. 세 차례 신규 에이전트 순차 리뷰·수정 게이트

세 리뷰는 **동시에 실행하지 않는다**. 기본 구현과 QA가 먼저 끝난 뒤 `리뷰 1 → 발견사항 수정 및 전체 재검증 → 리뷰 2 → 수정 및 재검증 → 리뷰 3 → 수정 및 최종 재검증` 순서로 진행한다. 각 리뷰어는 이전에 이 작업에 참여하지 않은 새 에이전트여야 하며 같은 에이전트를 재사용하지 않는다.

리뷰 보고서 공통 필수 항목:

- 신규 에이전트 식별자/이름, 시작·완료 시각, 기준 commit SHA
- 검토한 기획/정책/checklist 버전과 실제 파일 목록
- P0/P1/P2/P3 심각도별 발견사항, 재현 절차, 관련 파일/줄
- 직접 수정한 파일과 수정 이유
- 수정 전 실패 테스트와 수정 후 통과 테스트
- 발견 없음인 영역도 검토 방법과 증거를 명시
- 남은 위험, 면제/미해결 항목, 최종 판정

| ID | 순서·독립 역할 | 필수 작업 | 예상 증거 | 상태 |
|---|---|---|---|---|
| REV-000 | 사전 자체 QA | 구현 담당이 4~17절 전 행을 감사하고 `npm run verify` 및 양 플랫폼 전체 흐름을 통과한다. | `docs/reviews/pre-review-qa.md`, clean SHA, full logs | PENDING |
| REV-001 | 신규 에이전트 1: 제품·정책 완전성 | 두 기획 문서의 모든 요구를 코드/DB/UI와 역추적하고 누락·오계산·상태 흐름을 직접 수정한다. | `docs/reviews/review-01.md`, 수정 diff, 재실행 로그 | PENDING |
| REV-002 | 리뷰 1 수정 확정 게이트 | REV-001의 모든 P0/P1/P2를 수정·회귀 테스트하고 전체 verify를 통과하기 전 리뷰 2를 시작하지 않는다. | review-01 remediation table, commit SHA | PENDING |
| REV-003 | 신규 에이전트 2: 보안·데이터·신뢰성 | RLS/Storage/Realtime, 비멤버 공격, 동시성, 서버 시각, 오프라인/멱등성, 개인정보를 독립 검토하고 직접 수정한다. | `docs/reviews/review-02.md`, SQL/앱 diff, security logs | PENDING |
| REV-004 | 리뷰 2 수정 확정 게이트 | REV-003 발견사항과 회귀를 수정하고 DB advisor/RLS/전체 verify를 통과하기 전 리뷰 3을 시작하지 않는다. | review-02 remediation table, commit SHA | PENDING |
| REV-005 | 신규 에이전트 3: 최종 UX·플랫폼·접근성 E2E | iOS/Android 전체 플로우, 최종 glass UI, 오류/빈/오프라인, 접근성, 빌드·성능을 독립 검토하고 직접 수정한다. | `docs/reviews/review-03.md`, 영상/diff/수정 로그 | PENDING |
| REV-006 | 리뷰 3 최종 확정 게이트 | REV-005 발견사항 수정 후 4~17절을 다시 감사하고 clean SHA에서 전체 검증을 통과한다. | final `npm run verify`, iOS/Android E2E, DB/security reports | PENDING |
| REV-007 | 사용자 보고용 표 | 세 에이전트별 `리뷰 범위 / 발견 내용 / 심각도 / 수정 내용 / 검증 / 남은 위험`을 한 행 이상으로 정리한다. | `docs/04-review-summary.md` 및 최종 응답 표 | PENDING |

세 리뷰를 완료했다는 주장에는 세 개의 서로 다른 신규 에이전트 ID, 각 단계 사이의 수정 commit/working tree 증거, 단계별 재검증 로그가 모두 필요하다. 단순히 세 에이전트에게 동시에 의견만 받거나 보고서만 작성하고 수정하지 않은 경우 완료가 아니다.

## 19. 최종 완료 판정

다음 조건을 모두 만족할 때만 전체 구현 완료로 판정한다.

- 4~18절의 모든 P0/MVP 요구가 `PASS`이고 `PENDING`·`FAIL`·근거 없는 `N/A`가 없다.
- iOS와 Android의 전체 사용자 플로우, 빌드, 접근성, 오프라인 QA가 각각 증명됐다.
- Supabase RLS/Storage/Realtime/시간 경계/동시성 음성 테스트가 통과했다.
- 제품 문서의 계산 예시 4개와 월~금 보정·정산 경계가 클라이언트/서버/E2E에서 동일하다.
- 최종 `#FDF6E3` + 상단 요약 카드 + 글래스 멤버 바텀시트 UI가 양 플랫폼에서 승인됐다.
- 세 명의 서로 다른 신규 에이전트가 순차 리뷰하고, 각 리뷰 뒤 수정·전체 회귀 검증이 끝났다.
- `docs/04-review-summary.md`와 사용자 최종 보고의 표가 실제 리뷰 보고서/커밋/테스트 결과와 일치한다.
- 출시 전 법무·운영 결정이 끝나지 않았다면 “기능 구현 완료”와 “스토어 출시 준비 완료”를 구분해 표시한다.

## 20. 최종 리뷰 요약 표 템플릿

| 차수 | 신규 에이전트 | 기준 SHA | 리뷰 범위 | 핵심 발견 | 수정한 내용 | 검증 결과 | 남은 위험 |
|---:|---|---|---|---|---|---|---|
| 1 | PENDING | PENDING | 제품·정책 완전성 | PENDING | PENDING | PENDING | PENDING |
| 2 | PENDING | PENDING | 보안·데이터·신뢰성 | PENDING | PENDING | PENDING | PENDING |
| 3 | PENDING | PENDING | UX·플랫폼·접근성 E2E | PENDING | PENDING | PENDING | PENDING |
