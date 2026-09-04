import { useCallback, useMemo } from 'react';
import type { Expense } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import { shallowSetEqual, useAppStoreSelector } from '@/shared/providers/app-store-provider';
import type { AppIndexes } from '@/shared/model/app-indexes';
import { useIndexedArray, useIndexedList } from '@/shared/providers/store-hooks';

const EMPTY_EXPENSES: Expense[] = [];

const EMPTY_UNREAD_IDS: ReadonlySet<string> = new Set<string>();

const EMPTY_UNREAD_COUNTS: ReadonlyMap<string, number> = new Map<string, number>();

const pickExpensesByPeriodId = (indexes: AppIndexes) => indexes.expensesByPeriodId;

export function usePeriodExpenses(periodId: string | undefined): Expense[] {
  return useIndexedList(pickExpensesByPeriodId, periodId);
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

/**
 * 현재 주차에서 아직 상세를 열지 않은 남의 지출 ID.
 * 본인 지출과 방에 들어오기 전 지출은 새 것으로 보지 않는다.
 */
export function useUnreadExpenseIds(
  periodId: string | undefined,
  currentUserId: string | undefined,
  joinedAt?: string,
): ReadonlySet<string> {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => {
      if (!periodId || !currentUserId) return EMPTY_UNREAD_IDS;
      const expenses = state.indexes.expensesByPeriodId.get(periodId);
      if (!expenses?.length) return EMPTY_UNREAD_IDS;
      const unread = new Set<string>();
      expenses.forEach((expense) => {
        if (expense.userId === currentUserId) return;
        if (joinedAt && expense.createdAt < joinedAt) return;
        if (state.indexes.readExpenseIds.has(expense.id)) return;
        if (state.localReads.expenseIds.has(expense.id)) return;
        unread.add(expense.id);
      });
      return unread.size ? unread : EMPTY_UNREAD_IDS;
    }, [currentUserId, joinedAt, periodId]),
    shallowSetEqual,
  );
}

/** 멤버 아바타에 붙일 안 읽은 지출 건수. useUnreadExpenseIds가 고른 ID를 작성자별로 센다. */
export function useUnreadExpenseCountByUserId(
  periodId: string | undefined,
  unreadExpenseIds: ReadonlySet<string>,
): ReadonlyMap<string, number> {
  const expenses = usePeriodExpenses(periodId);
  return useMemo(() => {
    if (!unreadExpenseIds.size) return EMPTY_UNREAD_COUNTS;
    const counts = new Map<string, number>();
    expenses.forEach((expense) => {
      if (!unreadExpenseIds.has(expense.id)) return;
      counts.set(expense.userId, (counts.get(expense.userId) ?? 0) + 1);
    });
    return counts;
  }, [expenses, unreadExpenseIds]);
}

export function useSettlementExcludedExpenseIds(): ReadonlySet<string> {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => state.indexes.settlementExcludedExpenseIds, []),
  );
}
