import { useCallback } from 'react';
import type { Expense } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import { useAppStoreSelector } from '@/shared/providers/app-store-provider';
import { useIndexedArray } from '@/shared/providers/store-hooks';

const EMPTY_EXPENSES: Expense[] = [];

export function usePeriodExpenses(periodId: string | undefined): Expense[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        periodId ? state.indexes.expensesByPeriodId.get(periodId) ?? EMPTY_EXPENSES : EMPTY_EXPENSES
      ),
      [periodId],
    ),
  );
}

/**
 * 한 주차에서 한 사람이 기록한 지출. periodId는 선택 인자가 아니다: 주차를
 * 넘나드는 지출 목록은 존재하지 않고, 지난 주차는 지난 주차 화면에서 본다.
 */
export function useUserExpenses(
  userId: string | undefined,
  periodId: string | undefined,
): Expense[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        userId && periodId
          ? state.indexes.expensesByPeriodAndUserId.get(periodId)?.get(userId) ?? EMPTY_EXPENSES
          : EMPTY_EXPENSES
      ),
      [periodId, userId],
    ),
  );
}

export function useExpense(expenseId: string | undefined, requestId?: string): Expense | undefined {
  const selector = useCallback(
    (state: AppStoreState) => (
      (expenseId ? state.indexes.expenseById.get(expenseId) : undefined) ??
      (requestId
        ? state.snapshot?.expenses.find((expense) => expense.clientRequestId === requestId)
        : undefined)
    ),
    [expenseId, requestId],
  );
  return useAppStoreSelector(selector);
}

export function useSettlementExcludedExpenseIds(): ReadonlySet<string> {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => state.indexes.settlementExcludedExpenseIds, []),
  );
}
