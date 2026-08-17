# 홈 최근 피드를 이번 주차로 한정 — 기획 & 설계

- 문서 상태: **설계안 (검토 대기 · 구현 전)**
- 범위: 홈 화면의 최근 지출 캐러셀(`RecentExpenseCarousel`)이 현재 주차 지출만 보여주도록

---

## 1. 현황

홈의 최근 피드는 **주차와 무관하게 방 전체 지출**을 최신순으로 보여준다.

```
useRoomHome
  └ useRoomFeedExpenses(activeRoom.id)      ← 방의 모든 주차 지출
      └ indexes.feedExpensesByRoomId         ← 방 단위로만 묶여 있음
  → recentExpenses = roomFeedExpenses.slice(0, 10)
```

`buildRoomFeedIndex`([app-indexes.ts:183](../src/store/app-indexes.ts:183))는 지출을 `roomId`로만 묶고 `createdAt` 내림차순으로 정렬한다. 주차 개념이 들어가지 않는다.

---

## 2. 왜 바꾸나

**홈은 "이번 주 챌린지" 화면인데 피드만 시간축이 무한이다.**

홈 헤더는 위에서부터 이번 주 적용한도 → 남은 금액 → 이번 주 요일 캘린더를 말한다. 그 바로 아래 캐러셀에 지난주·지지난주 지출이 섞여 나오면, "지금 얼마 남았나"를 읽던 흐름이 끊긴다. 같은 화면의 두 블록이 서로 다른 기간을 말하고 있는 셈이다.

특히 주 초에 문제가 드러난다. 월요일 아침 캐러셀은 지난주 금요일 지출로 가득 차 있는데, 히어로는 이번 주 한도를 새로 말한다. 사용자가 보는 첫인상이 "지난주 기록"이다.

---

## 3. 결정 사항

| 항목 | 결정 |
|---|---|
| 홈 캐러셀 범위 | **현재 주차(`currentPeriod.id`) 지출만** |
| 정렬 | 지금과 같이 `createdAt` 내림차순, 최대 10건 |
| 삭제 표시 규칙 | 지금과 **동일하게** 유지 (§5.1 — 여기가 함정) |
| 멤버 피드(`/room/member/[userId]`) | **바꾸지 않는다** (§4) |
| 지난 주차 지출 접근 | 기존 `history/[id]` 경로 그대로 |

---

## 4. 바꾸지 않는 곳 — 멤버 피드

`/room/member/[userId]`는 `useMemberRoomFeedExpenses`로 같은 `feedExpensesByRoomId` 인덱스를 쓴다. **여기는 그대로 둔다.**

그 화면의 용도는 "이 사람이 그동안 뭘 썼나"를 보는 개인 히스토리다. 주차로 자르면 월요일에 남의 프로필이 텅 비어 화면의 목적 자체가 사라진다. 홈 캐러셀과 멤버 피드는 이름만 같은 "피드"일 뿐 하는 일이 다르다.

따라서 `feedExpensesByRoomId` 인덱스는 **없애지 않고 유지**한다.

---

## 5. 설계

### 5.1 함정 — 삭제 표시 규칙이 두 벌이다

현재 주차 지출은 이미 `usePeriodExpenses(currentPeriod.id)`로 홈에 들어와 있다. 그래서 "캐러셀만 그걸 쓰게 하면 끝"처럼 보이지만, **두 인덱스의 삭제 필터가 다르다.**

| 인덱스 | 필터 | 결과 |
|---|---|---|
| `feedExpensesByRoomId` | `if (expense.deletedAt) return` | 삭제된 지출은 **무조건** 숨김 |
| `expensesByPeriodId` | `isExpenseVisible` = `!deletedAt \|\| syncStatus !== 'SYNCED'` | 삭제가 아직 **동기화 안 된** 지출은 계속 보임 |

`expensesByPeriodId`로 갈아타면 오프라인에서 지운 지출이 캐러셀에 되살아난다. 지금 피드는 그걸 즉시 감춘다. 조용한 회귀이므로 반드시 피해야 한다.

### 5.2 해법 — 같은 순회에서 주차 인덱스를 하나 더 만든다

`buildRoomFeedIndex`를 `buildFeedIndexes`로 바꿔 **같은 루프에서** 두 Map을 채운다. 필터와 정렬 로직이 한 곳에 남으므로 두 벌이 어긋날 일이 없고, 순회 횟수도 늘지 않는다.

```ts
// app-indexes.ts
export type AppIndexes = {
  …
  /** 방별 피드 지출(삭제 제외), 게시 시각(createdAt) 최신순 정렬. */
  feedExpensesByRoomId: Map<string, Expense[]>;
  /** 주차별 피드 지출. 같은 필터·정렬을 쓰며 홈 캐러셀이 소비한다. */
  feedExpensesByPeriodId: Map<string, Expense[]>;
};

function buildFeedIndexes(expenses: Expense[], periods: Period[]): Pick<
  AppIndexes, 'feedExpensesByRoomId' | 'feedExpensesByPeriodId'
> {
  // roomIdByPeriodId 준비는 지금과 동일
  expenses.forEach((expense) => {
    if (expense.deletedAt || !expense.periodId) return;
    const roomId = roomIdByPeriodId.get(expense.periodId);
    if (!roomId) return;
    appendIndexValue(feedExpensesByRoomId, roomId, expense);
    appendIndexValue(feedExpensesByPeriodId, expense.periodId, expense);
  });
  // 두 Map 모두 createdAt 내림차순 정렬
}
```

재사용 가드는 기존과 같다 — `snapshot.expenses`와 `snapshot.periods`가 둘 다 이전과 같은 참조면 두 Map을 통째로 재사용한다. `createEmptyIndexes()`에도 빈 Map을 추가한다.

### 5.3 훅

```ts
/** 주차 피드 지출(삭제 제외) 최신순. 홈 캐러셀이 쓴다. */
export function usePeriodFeedExpenses(periodId: string | undefined): Expense[];
```

`useRoomFeedExpenses`와 같은 `useIndexedArray` + `shallowArrayEqual` 패턴. 기존 훅은 멤버 피드용으로 그대로 둔다.

### 5.4 `use-room-home.ts`

```diff
- const roomFeedExpenses = useRoomFeedExpenses(activeRoom?.id);
+ const periodFeedExpenses = usePeriodFeedExpenses(currentPeriod?.id);
```

파급 세 군데:

1. `recentExpenses: periodFeedExpenses.slice(0, 10)`
2. `commentCounts = useCommentCounts(periodFeedExpenses)` — 캐러셀 카드의 댓글 수 배지. 범위가 같이 좁아지는 게 맞다.
3. `memberUserIds` — 프로필 조회 대상. 지난 주차 작성자가 빠지지만 활성 멤버는 `members`에서 이미 들어오므로 캐러셀에 필요한 프로필은 모두 확보된다.

`RoomHomeData.recentExpenses`의 타입과 `RoomHomeHeader`의 소비 코드는 바뀌지 않는다.

---

## 6. 엣지 케이스 — 이 변경의 실질 비용

**주 초에 캐러셀이 빈다.** 지금은 지난주 것으로 채워져 있던 자리다. 이게 유일한 실질 비용이고, 빈 상태 처리가 이 작업의 절반이다.

| 상황 | 캐러셀 | 문구 |
|---|---|---|
| 이번 주 지출 0건 (`ACTIVE`) | 빈 카드 1장 | "이번 주 첫 지출을 남겨보세요" + 지출 등록 버튼 |
| 주차 시작 전 (`WAITING`) | 빈 카드 1장 | "월요일부터 시작해요" (등록 버튼 없음) |
| 쉬는 주 (`isRestWeek`) | **숨김** | 이미 헤더에 쉬는 주 배너가 있어 중복이다 |
| `SETTLEMENT` · `ARCHIVED` | 그 주 지출 그대로 | 잠긴 기록이라 등록 버튼은 안 띄운다 |
| 현재 주차 없음 (`currentPeriod` null) | 홈 자체가 `empty` 상태 | 기존 동작 유지 |

빈 카드로 두는 쪽을 권한다. 캐러셀을 통째로 숨기면 주 초 홈이 휑해지고, 히어로와 초대 섹션 사이가 붕 뜬다. 빈 카드에 등록 버튼을 두면 오히려 주 초 행동 유도가 된다.

`ADJUSTMENT`·`SETTLEMENT`(주말)에도 현재 주차는 여전히 그 주를 가리키므로 금요일 지출이 계속 보인다. 토요일 아침에 피드가 비는 일은 없다.

---

## 7. 파일 목록

| 파일 | 변경 |
|---|---|
| `src/store/app-indexes.ts` | `feedExpensesByPeriodId` 추가, `buildRoomFeedIndex` → `buildFeedIndexes` |
| `src/providers/app-data-hooks.ts` | `usePeriodFeedExpenses` 추가 |
| `src/hooks/use-room-home.ts` | 피드 소스 교체 (3곳) |
| `src/components/room/recent-expense-carousel.tsx` | 빈 상태·phase 분기 추가 |
| `src/store/app-indexes.test.ts` | 케이스 추가 |

DB·RPC·RLS 변경 없음. **순수 클라이언트 변경**이라 OTA로 나간다.

---

## 8. 검증

- `app-indexes.test.ts` — ① 주차 인덱스가 그 주 지출만 담는지 ② 삭제된 지출이 두 인덱스 모두에서 빠지는지 ③ `expenses`·`periods` 참조가 그대로일 때 두 Map이 재사용되는지.
- 수동: ① 지난주 지출이 홈 캐러셀에서 사라졌는지 ② 이번 주 0건일 때 빈 카드와 등록 버튼 ③ 쉬는 주에 캐러셀이 숨는지 ④ **오프라인에서 지출을 지웠을 때 캐러셀에서 즉시 사라지는지**(§5.1 회귀 확인) ⑤ 멤버 피드는 여전히 전 주차를 보여주는지.
- `npm run qa` 통과.

---

## 9. 열린 질문

1. 빈 캐러셀을 **빈 카드**로 둘지 **통째로 숨길지** (§6). 지금 안은 빈 카드다.
2. 지난 주차 지출로 가는 길을 홈에 둘지. 지금은 지출 탭 → "지난 챌린지"로만 갈 수 있고, 캐러셀이 좁아지면 그 경로가 유일해진다. 빈 카드에 "지난주 보기" 링크를 얹는 선택지가 있다.
