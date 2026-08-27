/**
 * 지출 상세로 가는 경로. 오프라인 큐가 낙관적 ID(`offline-expense-*`)를 서버 ID로
 * 교체해도 상세 화면이 같은 지출을 계속 찾을 수 있도록, 절대 바뀌지 않는 멱등 키를
 * `rid`로 함께 싣는다. 상세 화면은 id 조회가 빈손이면 rid로 폴백한다.
 */
export function expenseDetailHref(expenseId: string, clientRequestId?: string) {
  return {
    pathname: "/expense/[id]" as const,
    params: { id: expenseId, rid: clientRequestId },
  };
}
