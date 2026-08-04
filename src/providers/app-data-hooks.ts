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
  RoomRole,
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
const EMPTY_ROOM_MEMBERS: RoomMemberSummary[] = [];
const EMPTY_APPROVERS: ReadonlySet<string> = new Set();
const EMPTY_PENDING_APPROVALS: PendingExceptionApproval[] = [];

export type RoomMemberSummary = {
  userId: string;
  nickname: string;
  avatar: string;
  role: RoomRole;
  isCurrentUser: boolean;
};
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

/** 방의 활성 멤버 목록(프로필 포함). 방장 위임·나가기 UI에서 쓴다. */
export function useActiveRoomMembers(roomId: string | undefined): RoomMemberSummary[] {
  const selector = useCallback(
    (state: AppStoreState): RoomMemberSummary[] => {
      const snapshot = state.snapshot;
      if (!roomId || !snapshot) return EMPTY_ROOM_MEMBERS;
      const currentUserId = snapshot.currentUserId;
      return snapshot.roomMembers
        .filter((member) => member.roomId === roomId && member.status === 'ACTIVE')
        .map((member) => {
          const profile = state.indexes.profileById.get(member.userId);
          return {
            userId: member.userId,
            nickname: profile?.nickname ?? '알 수 없음',
            avatar: profile?.avatar ?? '',
            role: member.role,
            isCurrentUser: member.userId === currentUserId,
          };
        });
    },
    [roomId],
  );
  return useAppStoreSelector(selector, roomMemberSummariesEqual);
}

function roomMemberSummariesEqual(
  left: readonly RoomMemberSummary[],
  right: readonly RoomMemberSummary[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((value, index) => {
    const other = right[index];
    return (
      value.userId === other.userId &&
      value.nickname === other.nickname &&
      value.avatar === other.avatar &&
      value.role === other.role &&
      value.isCurrentUser === other.isCurrentUser
    );
  });
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

/** 정산에서 제외되는(만장일치 승인된 예외) 지출 ID 집합. 참조가 안정적이다. */
export function useSettlementExcludedExpenseIds(): ReadonlySet<string> {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => state.indexes.settlementExcludedExpenseIds, []),
  );
}

export type ExpenseExceptionSummary = {
  reason: string;
  requestedBy: string;
  approvedCount: number;
  requiredCount: number;
  approvedByMe: boolean;
  /** 현재 사용자가 이 주차의 활성 멤버라 승인할 수 있는지. */
  amApprover: boolean;
  isRequester: boolean;
  isExcluded: boolean;
};

/** 지출 상세의 예외 승인 카드에 필요한 요약. 예외가 없으면 undefined. */
export function useExpenseExceptionSummary(
  expenseId: string | undefined,
): ExpenseExceptionSummary | undefined {
  const selector = useCallback(
    (state: AppStoreState): ExpenseExceptionSummary | undefined => {
      if (!expenseId) return undefined;
      const exception = state.indexes.exceptionByExpenseId.get(expenseId);
      const expense = state.indexes.expenseById.get(expenseId);
      if (!exception || !expense || !expense.periodId) return undefined;
      const currentUserId = state.snapshot?.currentUserId;
      const activeMembers = (
        state.indexes.membersByPeriodId.get(expense.periodId) ?? EMPTY_MEMBERS
      ).filter((member) => member.status === 'ACTIVE');
      const approvers = state.indexes.approvedUserIdsByExpenseId.get(expenseId) ?? EMPTY_APPROVERS;
      return {
        reason: exception.reason,
        requestedBy: exception.requestedBy,
        approvedCount: activeMembers.filter((member) => approvers.has(member.userId)).length,
        requiredCount: activeMembers.length,
        approvedByMe: currentUserId ? approvers.has(currentUserId) : false,
        amApprover: currentUserId
          ? activeMembers.some((member) => member.userId === currentUserId)
          : false,
        isRequester: currentUserId === exception.requestedBy,
        isExcluded: state.indexes.settlementExcludedExpenseIds.has(expenseId),
      };
    },
    [expenseId],
  );
  return useAppStoreSelector(selector, expenseExceptionSummaryEqual);
}

export type PendingExceptionApproval = {
  expenseId: string;
  reason: string;
  requesterNickname: string;
  requesterAvatar: string;
  amount: number;
  category: Expense['category'];
  approvedCount: number;
  requiredCount: number;
};

/** 현재 사용자가 아직 승인하지 않은, 승인 가능한 예외들(홈 대기함). */
export function usePendingExceptionApprovals(): PendingExceptionApproval[] {
  const selector = useCallback((state: AppStoreState): PendingExceptionApproval[] => {
    const snapshot = state.snapshot;
    const currentUserId = snapshot?.currentUserId;
    if (!snapshot || !currentUserId) return EMPTY_PENDING_APPROVALS;
    const pending: PendingExceptionApproval[] = [];
    for (const exception of snapshot.expenseExceptions) {
      if (state.indexes.settlementExcludedExpenseIds.has(exception.expenseId)) continue;
      const expense = state.indexes.expenseById.get(exception.expenseId);
      if (!expense || !expense.periodId) continue;
      const period = state.indexes.periodById.get(expense.periodId);
      // 승인은 C(보정 마감)까지만 열려 있다: ACTIVE/ADJUSTMENT 주차만 대상.
      if (!period || (period.phase !== 'ACTIVE' && period.phase !== 'ADJUSTMENT')) continue;
      const activeMembers = (
        state.indexes.membersByPeriodId.get(expense.periodId) ?? EMPTY_MEMBERS
      ).filter((member) => member.status === 'ACTIVE');
      if (!activeMembers.some((member) => member.userId === currentUserId)) continue;
      const approvers = state.indexes.approvedUserIdsByExpenseId.get(exception.expenseId) ?? EMPTY_APPROVERS;
      if (approvers.has(currentUserId)) continue;
      const profile = state.indexes.profileById.get(exception.requestedBy);
      pending.push({
        expenseId: exception.expenseId,
        reason: exception.reason,
        requesterNickname: profile?.nickname ?? '알 수 없음',
        requesterAvatar: profile?.avatar ?? '',
        amount: expense.amount,
        category: expense.category,
        approvedCount: activeMembers.filter((member) => approvers.has(member.userId)).length,
        requiredCount: activeMembers.length,
      });
    }
    return pending.length ? pending : EMPTY_PENDING_APPROVALS;
  }, []);
  return useAppStoreSelector(selector, pendingExceptionApprovalsEqual);
}

function expenseExceptionSummaryEqual(
  left: ExpenseExceptionSummary | undefined,
  right: ExpenseExceptionSummary | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.reason === right.reason &&
    left.requestedBy === right.requestedBy &&
    left.approvedCount === right.approvedCount &&
    left.requiredCount === right.requiredCount &&
    left.approvedByMe === right.approvedByMe &&
    left.amApprover === right.amApprover &&
    left.isRequester === right.isRequester &&
    left.isExcluded === right.isExcluded
  );
}

function pendingExceptionApprovalsEqual(
  left: readonly PendingExceptionApproval[],
  right: readonly PendingExceptionApproval[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((value, index) => {
    const other = right[index];
    return (
      value.expenseId === other.expenseId &&
      value.reason === other.reason &&
      value.requesterNickname === other.requesterNickname &&
      value.requesterAvatar === other.requesterAvatar &&
      value.amount === other.amount &&
      value.category === other.category &&
      value.approvedCount === other.approvedCount &&
      value.requiredCount === other.requiredCount
    );
  });
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
