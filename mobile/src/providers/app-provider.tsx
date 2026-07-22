import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getRepositoryRuntime, type DataMode } from '@/data/repository-factory';
import type { OfflineMutationSummary } from '@/data/offline-queue-repository';
import { expenseOfficialAmount, isExpenseVisible } from '@/data/expense-sync';
import type { AppRepository } from '@/data/repository';
import type {
  AddCommentInput,
  AddExpenseInput,
  AppSnapshot,
  Comment,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Period,
  PeriodMember,
  PeriodResult,
  Profile,
  Room,
  RoomMember,
  RoomMemberStats,
} from '@/data/types';
import { selectCrownHolders } from '@/domain';

export type AppDataContextValue = {
  dataMode: DataMode;
  isConfigured: boolean;
  isSupabaseConfigured: boolean;
  snapshot: AppSnapshot | null;
  loading: boolean;
  error: string | null;
  currentUser: Profile | null;
  /** 내가 활성 멤버인 열린 방 (단일 방 참여 전제). */
  activeRoom: Room | null;
  /** activeRoom의 진행(또는 대기·정산) 중인 주차. */
  currentPeriod: Period | null;
  /** 내가 참여했던 방들의 정산 완료 주차, 최신순. */
  pastPeriods: Period[];
  syncOperations: OfflineMutationSummary[];
  getRoom: (roomId: string) => Room | undefined;
  getPeriod: (periodId: string) => Period | undefined;
  getRoomMembers: (roomId: string) => RoomMember[];
  getMembers: (periodId: string) => PeriodMember[];
  getExpense: (expenseId: string) => Expense | undefined;
  getExpenses: (periodId?: string) => Expense[];
  getUserExpenses: (userId: string, periodId?: string) => Expense[];
  getComments: (expenseId: string) => Comment[];
  getProfile: (userId: string) => Profile | undefined;
  getCrownIds: (periodId: string) => string[];
  getResults: (periodId: string) => PeriodResult[];
  getStats: (roomId: string) => RoomMemberStats[];
};

export type AppActionsContextValue = {
  refresh: () => Promise<void>;
  clearError: () => void;
  resetDemo: () => Promise<void>;
  createRoom: (input: CreateRoomInput) => Promise<Room>;
  increaseCapacity: (roomId: string, capacity: number) => Promise<Room>;
  previewInvite: (inviteCode: string) => Promise<InvitePreview>;
  joinRoom: (inviteCode: string) => Promise<RoomMember>;
  leaveRoom: (roomId: string, successorUserId?: string) => Promise<void>;
  closeRoom: (roomId: string) => Promise<Room>;
  addExpense: (input: AddExpenseInput) => Promise<Expense>;
  updateExpense: (expenseId: string, patch: Partial<AddExpenseInput>) => Promise<Expense>;
  deleteExpense: (expenseId: string) => Promise<void>;
  addComment: (input: AddCommentInput) => Promise<Comment>;
  updateComment: (commentId: string, body: string) => Promise<Comment>;
  deleteComment: (commentId: string) => Promise<void>;
  retrySyncOperation: (operationId: string) => Promise<void>;
  discardSyncOperation: (operationId: string) => Promise<void>;
  getCopyableSyncError: (operationId: string) => Promise<string | null>;
};

type AppIndexes = {
  roomById: Map<string, Room>;
  periodById: Map<string, Period>;
  profileById: Map<string, Profile>;
  roomMembersByRoomId: Map<string, RoomMember[]>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expenseById: Map<string, Expense>;
  expenses: Expense[];
  expensesByPeriodId: Map<string, Expense[]>;
  expensesByUserId: Map<string, Expense[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  commentsByExpenseId: Map<string, Comment[]>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
  statsByRoomId: Map<string, RoomMemberStats[]>;
  crownIdsByPeriodId: Map<string, string[]>;
};

const EMPTY_ROOM_MEMBERS: RoomMember[] = [];
const EMPTY_MEMBERS: PeriodMember[] = [];
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_RESULTS: PeriodResult[] = [];
const EMPTY_STATS: RoomMemberStats[] = [];
const EMPTY_IDS: string[] = [];
const AppDataContext = createContext<AppDataContextValue | null>(null);
const AppActionsContext = createContext<AppActionsContextValue | null>(null);
const runtime = getRepositoryRuntime();
const repository: AppRepository = runtime.repository;

export function AppProvider({
  children,
  sessionUserId,
}: PropsWithChildren<{ sessionUserId: string | null }>) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [syncOperations, setSyncOperations] = useState<OfflineMutationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const acceptsSnapshot = useCallback(
    (nextSnapshot: AppSnapshot) =>
      runtime.dataMode !== 'supabase' || (
        Boolean(sessionUserId) && nextSnapshot.currentUserId === sessionUserId
      ),
    [sessionUserId],
  );

  const refreshSyncOperations = useCallback(async () => {
    try {
      setSyncOperations(runtime.offlineQueue
        ? await runtime.offlineQueue.getQueueOperations()
        : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '동기화 대기열을 읽지 못했어요.');
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextSnapshot = await repository.load();
      if (acceptsSnapshot(nextSnapshot)) setSnapshot(nextSnapshot);
      await refreshSyncOperations();
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했어요.');
      await refreshSyncOperations();
    } finally {
      setLoading(false);
    }
  }, [acceptsSnapshot, refreshSyncOperations]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = repository.subscribe((nextSnapshot) => {
      if (!cancelled && acceptsSnapshot(nextSnapshot)) {
        setSnapshot(nextSnapshot);
        setError(null);
        setLoading(false);
        void refreshSyncOperations();
      }
    });
    repository
      .load()
      .then((nextSnapshot) => {
        if (!cancelled && acceptsSnapshot(nextSnapshot)) setSnapshot(nextSnapshot);
        if (!cancelled) void refreshSyncOperations();
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했어요.');
          void refreshSyncOperations();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [acceptsSnapshot, refreshSyncOperations]);

  const execute = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      return await action();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '요청을 처리하지 못했어요.';
      setError(message);
      throw reason;
    }
  }, []);

  const indexes = useMemo<AppIndexes>(() => {
    const roomById = new Map<string, Room>();
    const periodById = new Map<string, Period>();
    const profileById = new Map<string, Profile>();
    const roomMembersByRoomId = new Map<string, RoomMember[]>();
    const membersByPeriodId = new Map<string, PeriodMember[]>();
    const expenseById = new Map<string, Expense>();
    const expenses: Expense[] = [];
    const expensesByPeriodId = new Map<string, Expense[]>();
    const expensesByUserId = new Map<string, Expense[]>();
    const expensesByPeriodAndUserId = new Map<string, Map<string, Expense[]>>();
    const commentsByExpenseId = new Map<string, Comment[]>();
    const resultsByPeriodId = new Map<string, PeriodResult[]>();
    const statsByRoomId = new Map<string, RoomMemberStats[]>();
    const crownIdsByPeriodId = new Map<string, string[]>();

    snapshot?.rooms.forEach((room) => {
      roomById.set(room.id, room);
    });
    snapshot?.periods.forEach((period) => {
      periodById.set(period.id, period);
    });
    snapshot?.profiles.forEach((profile) => {
      profileById.set(profile.id, profile);
    });
    snapshot?.roomMembers.forEach((member) => {
      appendIndexValue(roomMembersByRoomId, member.roomId, member);
    });
    snapshot?.periodMembers.forEach((member) => {
      appendIndexValue(membersByPeriodId, member.periodId, member);
    });
    snapshot?.expenses.forEach((expense) => {
      if (!isExpenseVisible(expense)) return;
      expenseById.set(expense.id, expense);
      expenses.push(expense);
      appendIndexValue(expensesByUserId, expense.userId, expense);
      if (!expense.periodId) return;
      appendIndexValue(expensesByPeriodId, expense.periodId, expense);
      let periodExpenses = expensesByPeriodAndUserId.get(expense.periodId);
      if (!periodExpenses) {
        periodExpenses = new Map<string, Expense[]>();
        expensesByPeriodAndUserId.set(expense.periodId, periodExpenses);
      }
      appendIndexValue(periodExpenses, expense.userId, expense);
    });
    snapshot?.comments.forEach((comment) => {
      appendIndexValue(commentsByExpenseId, comment.expenseId, comment);
    });
    snapshot?.periodResults.forEach((result) => {
      appendIndexValue(resultsByPeriodId, result.periodId, result);
    });
    snapshot?.memberStats.forEach((stats) => {
      appendIndexValue(statsByRoomId, stats.roomId, stats);
    });
    snapshot?.periods.forEach((period) => {
      // 정산 스냅샷이 있으면 그 왕관이 확정값이고, 진행 중에는 실시간 계산한다.
      const results = resultsByPeriodId.get(period.id);
      if (results?.length) {
        crownIdsByPeriodId.set(
          period.id,
          results.filter((result) => result.isCrown).map((result) => result.userId),
        );
        return;
      }
      const crownIds = selectCrownHolders(
        (membersByPeriodId.get(period.id) ?? EMPTY_MEMBERS).map((member) => ({
          memberId: member.userId,
          nickname: profileById.get(member.userId)?.nickname ?? '알 수 없음',
          status: member.status,
          appliedLimit: member.appliedLimit,
          eligibleSpending: (
            expensesByPeriodAndUserId.get(period.id)?.get(member.userId) ?? EMPTY_EXPENSES
          ).reduce((sum, expense) => sum + expenseOfficialAmount(expense), 0),
        })),
        'ACTIVE',
      ).holderIds;
      crownIdsByPeriodId.set(period.id, [...crownIds]);
    });

    return {
      roomById,
      periodById,
      profileById,
      roomMembersByRoomId,
      membersByPeriodId,
      expenseById,
      expenses,
      expensesByPeriodId,
      expensesByUserId,
      expensesByPeriodAndUserId,
      commentsByExpenseId,
      resultsByPeriodId,
      statsByRoomId,
      crownIdsByPeriodId,
    };
  }, [snapshot]);

  const getRoom = useCallback(
    (roomId: string) => indexes.roomById.get(roomId),
    [indexes],
  );
  const getPeriod = useCallback(
    (periodId: string) => indexes.periodById.get(periodId),
    [indexes],
  );
  const getRoomMembers = useCallback(
    (roomId: string) => indexes.roomMembersByRoomId.get(roomId) ?? EMPTY_ROOM_MEMBERS,
    [indexes],
  );
  const getMembers = useCallback(
    (periodId: string) => indexes.membersByPeriodId.get(periodId) ?? EMPTY_MEMBERS,
    [indexes],
  );
  const getExpenses = useCallback(
    (periodId?: string) =>
      periodId
        ? indexes.expensesByPeriodId.get(periodId) ?? EMPTY_EXPENSES
        : indexes.expenses,
    [indexes],
  );
  const getExpense = useCallback(
    (expenseId: string) => indexes.expenseById.get(expenseId),
    [indexes],
  );
  const getUserExpenses = useCallback(
    (userId: string, periodId?: string) =>
      periodId
        ? indexes.expensesByPeriodAndUserId.get(periodId)?.get(userId) ?? EMPTY_EXPENSES
        : indexes.expensesByUserId.get(userId) ?? EMPTY_EXPENSES,
    [indexes],
  );
  const getComments = useCallback(
    (expenseId: string) => indexes.commentsByExpenseId.get(expenseId) ?? EMPTY_COMMENTS,
    [indexes],
  );
  const getProfile = useCallback(
    (userId: string) => indexes.profileById.get(userId),
    [indexes],
  );
  const getCrownIds = useCallback(
    (periodId: string) => {
      const period = getPeriod(periodId);
      if (!period || period.phase === 'WAITING' || period.isRestWeek) return EMPTY_IDS;
      return indexes.crownIdsByPeriodId.get(periodId) ?? EMPTY_IDS;
    },
    [getPeriod, indexes],
  );
  const getResults = useCallback(
    (periodId: string) => indexes.resultsByPeriodId.get(periodId) ?? EMPTY_RESULTS,
    [indexes],
  );
  const getStats = useCallback(
    (roomId: string) => indexes.statsByRoomId.get(roomId) ?? EMPTY_STATS,
    [indexes],
  );

  const currentUser = useMemo(
    () =>
      snapshot
        ? indexes.profileById.get(snapshot.currentUserId) ?? null
        : null,
    [indexes, snapshot],
  );
  const activeRoom = useMemo(() => {
    if (!snapshot) return null;
    const myRoomIds = new Set(
      snapshot.roomMembers
        .filter((member) => member.userId === snapshot.currentUserId && member.status === 'ACTIVE')
        .map((member) => member.roomId),
    );
    return snapshot.rooms.find((room) => myRoomIds.has(room.id) && room.status === 'OPEN') ?? null;
  }, [snapshot]);
  const currentPeriod = useMemo(() => {
    if (!snapshot || !activeRoom) return null;
    return (
      snapshot.periods
        .filter((period) => period.roomId === activeRoom.id && period.phase !== 'ARCHIVED')
        .sort((left, right) => right.weekStart.localeCompare(left.weekStart))[0] ?? null
    );
  }, [activeRoom, snapshot]);
  const pastPeriods = useMemo(() => {
    if (!snapshot) return [];
    const myRoomIds = new Set(
      snapshot.roomMembers
        .filter((member) => member.userId === snapshot.currentUserId)
        .map((member) => member.roomId),
    );
    return snapshot.periods
      .filter((period) => myRoomIds.has(period.roomId) && period.phase === 'ARCHIVED')
      .sort((left, right) => right.weekStart.localeCompare(left.weekStart));
  }, [snapshot]);

  const clearError = useCallback(() => setError(null), []);
  const resetDemo = useCallback(
    () => execute(async () => void setSnapshot(await repository.resetDemo())),
    [execute],
  );
  const createRoom = useCallback(
    (input: CreateRoomInput) => execute(() => repository.createRoom(input)),
    [execute],
  );
  const increaseCapacity = useCallback(
    (roomId: string, capacity: number) => execute(() => repository.increaseCapacity(roomId, capacity)),
    [execute],
  );
  const previewInvite = useCallback(
    (code: string) => execute(() => repository.previewInvite(code)),
    [execute],
  );
  const joinRoom = useCallback(
    (code: string) => execute(() => repository.joinRoom(code)),
    [execute],
  );
  const leaveRoom = useCallback(
    (roomId: string, successorUserId?: string) =>
      execute(() => repository.leaveRoom(roomId, successorUserId)),
    [execute],
  );
  const closeRoom = useCallback(
    (roomId: string) => execute(() => repository.closeRoom(roomId)),
    [execute],
  );
  const addExpense = useCallback(
    (input: AddExpenseInput) => execute(() => repository.addExpense(input)),
    [execute],
  );
  const updateExpense = useCallback(
    (expenseId: string, patch: Partial<AddExpenseInput>) =>
      execute(() => repository.updateExpense(expenseId, patch)),
    [execute],
  );
  const deleteExpense = useCallback(
    (expenseId: string) => execute(() => repository.deleteExpense(expenseId)),
    [execute],
  );
  const addComment = useCallback(
    (input: AddCommentInput) => execute(() => repository.addComment(input)),
    [execute],
  );
  const updateComment = useCallback(
    (commentId: string, body: string) => execute(() => repository.updateComment(commentId, body)),
    [execute],
  );
  const deleteComment = useCallback(
    (commentId: string) => execute(() => repository.deleteComment(commentId)),
    [execute],
  );
  const retrySyncOperation = useCallback(
    (operationId: string) => execute(async () => {
      if (!runtime.offlineQueue) return;
      await runtime.offlineQueue.retryOperation(operationId);
      await refreshSyncOperations();
    }),
    [execute, refreshSyncOperations],
  );
  const discardSyncOperation = useCallback(
    (operationId: string) => execute(async () => {
      if (!runtime.offlineQueue) return;
      await runtime.offlineQueue.discardOperation(operationId);
      await refreshSyncOperations();
    }),
    [execute, refreshSyncOperations],
  );
  const getCopyableSyncError = useCallback(
    (operationId: string) => runtime.offlineQueue?.getCopyableError(operationId) ?? Promise.resolve(null),
    [],
  );

  const dataValue = useMemo<AppDataContextValue>(() => ({
    dataMode: runtime.dataMode,
    isConfigured: runtime.isConfigured,
    isSupabaseConfigured: runtime.isSupabaseConfigured,
    snapshot,
    loading,
    error,
    currentUser,
    activeRoom,
    currentPeriod,
    pastPeriods,
    syncOperations,
    getRoom,
    getPeriod,
    getRoomMembers,
    getMembers,
    getExpense,
    getExpenses,
    getUserExpenses,
    getComments,
    getProfile,
    getCrownIds,
    getResults,
    getStats,
  }), [
    activeRoom,
    currentPeriod,
    currentUser,
    error,
    getComments,
    getCrownIds,
    getExpense,
    getExpenses,
    getMembers,
    getPeriod,
    getProfile,
    getResults,
    getRoom,
    getRoomMembers,
    getStats,
    getUserExpenses,
    loading,
    pastPeriods,
    snapshot,
    syncOperations,
  ]);

  const actionsValue = useMemo<AppActionsContextValue>(() => ({
    refresh,
    clearError,
    resetDemo,
    createRoom,
    increaseCapacity,
    previewInvite,
    joinRoom,
    leaveRoom,
    closeRoom,
    addExpense,
    updateExpense,
    deleteExpense,
    addComment,
    updateComment,
    deleteComment,
    retrySyncOperation,
    discardSyncOperation,
    getCopyableSyncError,
  }), [
    addComment,
    addExpense,
    clearError,
    closeRoom,
    createRoom,
    deleteComment,
    deleteExpense,
    discardSyncOperation,
    getCopyableSyncError,
    increaseCapacity,
    joinRoom,
    leaveRoom,
    previewInvite,
    refresh,
    resetDemo,
    retrySyncOperation,
    updateComment,
    updateExpense,
  ]);

  return (
    <AppActionsContext.Provider value={actionsValue}>
      <AppDataContext.Provider value={dataValue}>
        {children}
      </AppDataContext.Provider>
    </AppActionsContext.Provider>
  );
}

export function useAppData(): AppDataContextValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside AppProvider');
  return context;
}

export function useAppActions(): AppActionsContextValue {
  const context = useContext(AppActionsContext);
  if (!context) throw new Error('useAppActions must be used inside AppProvider');
  return context;
}

function appendIndexValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
