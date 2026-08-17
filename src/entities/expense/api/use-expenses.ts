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

/** 현재 방에서 볼 수 있는 모든 주차 지출을 게시 시각 최신순으로 가져온다. */

export function useRoomFeedExpenses(roomId: string | undefined): Expense[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        roomId
          ? state.indexes.feedExpensesByRoomId.get(roomId) ?? EMPTY_EXPENSES
          : EMPTY_EXPENSES
      ),
      [roomId],
    ),
  );
}

export function useMemberRoomFeedExpenses(
  roomId: string | undefined,
  userId: string | undefined,
): Expense[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => {
        if (!roomId || !userId) return EMPTY_EXPENSES;
        // 방 피드는 이미 삭제 제외·최신순 정렬돼 있어 작성자 필터만 하면 된다.
        const feed = state.indexes.feedExpensesByRoomId.get(roomId);
        if (!feed) return EMPTY_EXPENSES;
        const mine = feed.filter((expense) => expense.userId === userId);
        return mine.length ? mine : EMPTY_EXPENSES;
      },
      [roomId, userId],
    ),
  );
}

export function useUserExpenses(userId: string | undefined, periodId?: string): Expense[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => {
        if (!userId) return EMPTY_EXPENSES;
        return periodId
          ? state.indexes.expensesByPeriodAndUserId.get(periodId)?.get(userId) ?? EMPTY_EXPENSES
          : state.indexes.expensesByUserId.get(userId) ?? EMPTY_EXPENSES;
      },
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
