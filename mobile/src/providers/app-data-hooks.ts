import { useCallback, useMemo } from 'react';

import type {
  Comment,
  Expense,
  Period,
  PeriodMember,
  PeriodResult,
  Profile,
  Room,
  RoomMemberStats,
} from '@/data/types';
import type { DataMode } from '@/data/repository-factory';
import {
  shallowEqual,
  shallowMapEqual,
  useAppStoreSelector,
} from '@/providers/app-store-provider';
import type { AppStoreState } from '@/store/app-store';

const EMPTY_MEMBERS: PeriodMember[] = [];
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_RESULTS: PeriodResult[] = [];
const EMPTY_IDS: string[] = [];
const selectDataMode = (state: AppStoreState) => state.dataMode;
const selectCurrentUser = (state: AppStoreState) => state.currentUser;
const selectActiveRoom = (state: AppStoreState) => state.activeRoom;
const selectCurrentRoom = (state: AppStoreState) => ({
  currentUser: state.currentUser,
  activeRoom: state.activeRoom,
  currentPeriod: state.currentPeriod,
});
const selectHistory = (state: AppStoreState) => ({ pastPeriods: state.pastPeriods });
const historyEqual = (left: { pastPeriods: Period[] }, right: { pastPeriods: Period[] }) => (
  shallowArrayEqual(left.pastPeriods, right.pastPeriods)
);

export function useAppDataMode(): DataMode {
  return useAppStoreSelector(selectDataMode);
}

export function useCurrentUser(): Profile | null {
  return useAppStoreSelector(selectCurrentUser);
}

export function useActiveRoom(): Room | null {
  return useAppStoreSelector(selectActiveRoom);
}

export function useCurrentRoom(): {
  currentUser: Profile | null;
  activeRoom: Room | null;
  currentPeriod: Period | null;
} {
  return useAppStoreSelector(
    selectCurrentRoom,
    shallowEqual,
  );
}

export function useHistory(): { pastPeriods: Period[] } {
  return useAppStoreSelector(
    selectHistory,
    historyEqual,
  );
}

export function useRoom(roomId: string | undefined): Room | undefined {
  const selector = useCallback(
    (state: AppStoreState) => roomId ? state.indexes.roomById.get(roomId) : undefined,
    [roomId],
  );
  return useAppStoreSelector(selector);
}

export function usePeriod(periodId: string | undefined): Period | undefined {
  const selector = useCallback(
    (state: AppStoreState) => periodId ? state.indexes.periodById.get(periodId) : undefined,
    [periodId],
  );
  return useAppStoreSelector(selector);
}

export function usePeriodMembers(periodId: string | undefined): PeriodMember[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        periodId ? state.indexes.membersByPeriodId.get(periodId) ?? EMPTY_MEMBERS : EMPTY_MEMBERS
      ),
      [periodId],
    ),
  );
}

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

export function useExpenseComments(expenseId: string | undefined): Comment[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        expenseId ? state.indexes.commentsByExpenseId.get(expenseId) ?? EMPTY_COMMENTS : EMPTY_COMMENTS
      ),
      [expenseId],
    ),
  );
}

export function useProfiles(userIds: readonly string[]): ReadonlyMap<string, Profile> {
  const normalizedIds = useStableIds(userIds);
  const selector = useCallback((state: AppStoreState) => {
    const profiles = new Map<string, Profile>();
    normalizedIds.forEach((userId) => {
      const profile = state.indexes.profileById.get(userId);
      if (profile) profiles.set(userId, profile);
    });
    return profiles;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowMapEqual);
}

export function useRooms(roomIds: readonly string[]): ReadonlyMap<string, Room> {
  const normalizedIds = useStableIds(roomIds);
  const selector = useCallback((state: AppStoreState) => {
    const rooms = new Map<string, Room>();
    normalizedIds.forEach((roomId) => {
      const room = state.indexes.roomById.get(roomId);
      if (room) rooms.set(roomId, room);
    });
    return rooms;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowMapEqual);
}

export function useResultsForPeriods(
  periodIds: readonly string[],
): ReadonlyMap<string, PeriodResult[]> {
  const normalizedIds = useStableIds(periodIds);
  const selector = useCallback((state: AppStoreState) => {
    const results = new Map<string, PeriodResult[]>();
    normalizedIds.forEach((periodId) => {
      results.set(
        periodId,
        state.indexes.resultsByPeriodId.get(periodId) ?? EMPTY_RESULTS,
      );
    });
    return results;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowArrayMapEqual);
}

export function useRoomStats(roomId: string | undefined): RoomMemberStats[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        roomId ? state.indexes.statsByRoomId.get(roomId) ?? [] : []
      ),
      [roomId],
    ),
  );
}

export function useCommentCounts(expenses: readonly Expense[]): ReadonlyMap<string, number> {
  const selector = useCallback((state: AppStoreState) => {
    const counts = new Map<string, number>();
    expenses.forEach((expense) => {
      const count = state.indexes.commentCountByExpenseId.get(expense.id);
      if (count) counts.set(expense.id, count);
    });
    return counts;
  }, [expenses]);
  return useAppStoreSelector(selector, shallowMapEqual);
}

export function useCrownIds(periodId: string | undefined): string[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => {
        if (!periodId) return EMPTY_IDS;
        const period = state.indexes.periodById.get(periodId);
        if (!period || period.phase === 'WAITING' || period.isRestWeek) return EMPTY_IDS;
        return state.indexes.crownIdsByPeriodId.get(periodId) ?? EMPTY_IDS;
      },
      [periodId],
    ),
  );
}

export function usePeriodResults(periodId: string | undefined): PeriodResult[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        periodId ? state.indexes.resultsByPeriodId.get(periodId) ?? EMPTY_RESULTS : EMPTY_RESULTS
      ),
      [periodId],
    ),
  );
}

function useIndexedArray<T>(selector: (state: AppStoreState) => T[]): T[] {
  return useAppStoreSelector(selector, shallowArrayEqual);
}

function shallowArrayEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left === right || (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

function shallowArrayMapEqual<K, V>(
  left: ReadonlyMap<K, V[]>,
  right: ReadonlyMap<K, V[]>,
): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, values] of left) {
    const nextValues = right.get(key);
    if (!nextValues || !shallowArrayEqual(values, nextValues)) return false;
  }
  return true;
}

function useStableIds(ids: readonly string[]): readonly string[] {
  const key = [...new Set(ids)].sort().join('\u0000');
  return useMemo(() => key ? key.split('\u0000') : [], [key]);
}
