import type { Expense } from '@/shared/api/types';

/** Amount that is already confirmed by the server and may affect official results. */
export function expenseOfficialAmount(expense: Expense): number {
  if (expense.syncStatus === 'SYNCED') return expense.deletedAt ? 0 : expense.amount;
  return expense.serverAmount ?? 0;
}

/** Amount shown in the user's temporary projection while a mutation is pending. */
export function expenseOptimisticAmount(expense: Expense): number {
  const official = expenseOfficialAmount(expense);
  if (!hasPendingExpenseProjection(expense)) return official;
  if (expense.syncOperation === 'DELETE') return 0;
  return expense.amount;
}

/** Failed mutations keep their local projection visible until the user retries or repairs them. */
export function hasPendingExpenseProjection(expense: Expense): boolean {
  return expense.syncStatus === 'PENDING' || expense.syncStatus === 'FAILED';
}

export function expensePendingDelta(expense: Expense): number {
  return expenseOptimisticAmount(expense) - expenseOfficialAmount(expense);
}

export function hasOfficialExpenseRecord(expense: Expense): boolean {
  if (expense.syncStatus === 'SYNCED') return !expense.deletedAt;
  return expense.serverAmount !== undefined;
}

export function expenseOfficialCategory(expense: Expense): Expense['category'] | undefined {
  return hasOfficialExpenseRecord(expense)
    ? expense.serverCategory ?? expense.category
    : undefined;
}

/** Keep a pending deletion visible until the server confirms it. */
export function isExpenseVisible(expense: Expense): boolean {
  return !expense.deletedAt || expense.syncStatus !== 'SYNCED';
}

/**
 * 피드 노출 규칙. isExpenseVisible보다 엄격해서 아직 서버가 확인하지 않은
 * 삭제도 즉시 숨긴다: 내가 지운 지출이 남의 피드에 남아 보이면 안 된다.
 */
export function isFeedVisibleExpense(expense: Expense): boolean {
  return !expense.deletedAt;
}

/** 피드 정렬: 서버 게시 시각 최신순. createdAt은 ISO(UTC)라 사전식=시간순. */
export function compareExpenseFeedOrder(left: Expense, right: Expense): number {
  return right.createdAt.localeCompare(left.createdAt);
}
