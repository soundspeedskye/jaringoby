import type { Expense } from '@/data/types';

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
