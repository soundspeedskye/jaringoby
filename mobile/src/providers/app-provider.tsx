import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getRepositoryRuntime, type DataMode } from '@/data/repository-factory';
import type { AppRepository } from '@/data/repository';
import type {
  AddCommentInput,
  AddExpenseInput,
  AppSnapshot,
  Challenge,
  ChallengeMember,
  Comment,
  CreateChallengeInput,
  Expense,
  InvitePreview,
  Profile,
} from '@/data/types';
import { createChallengeTimeline, getChallengePhase, selectCrownHolders } from '@/domain';

export type AppDataContextValue = {
  dataMode: DataMode;
  isConfigured: boolean;
  isSupabaseConfigured: boolean;
  snapshot: AppSnapshot | null;
  loading: boolean;
  error: string | null;
  currentUser: Profile | null;
  activeChallenge: Challenge | null;
  archivedChallenges: Challenge[];
  getChallenge: (challengeId: string) => Challenge | undefined;
  getMembers: (challengeId: string) => ChallengeMember[];
  getExpense: (expenseId: string) => Expense | undefined;
  getExpenses: (challengeId?: string) => Expense[];
  getUserExpenses: (userId: string, challengeId?: string) => Expense[];
  getComments: (expenseId: string) => Comment[];
  getProfile: (userId: string) => Profile | undefined;
  getCrownIds: (challengeId: string) => string[];
};

export type AppActionsContextValue = {
  refresh: () => Promise<void>;
  clearError: () => void;
  resetDemo: () => Promise<void>;
  createChallenge: (input: CreateChallengeInput) => Promise<Challenge>;
  increaseCapacity: (challengeId: string, capacity: number) => Promise<Challenge>;
  previewInvite: (inviteCode: string) => Promise<InvitePreview>;
  joinChallenge: (inviteCode: string) => Promise<ChallengeMember>;
  addExpense: (input: AddExpenseInput) => Promise<Expense>;
  updateExpense: (expenseId: string, patch: Partial<AddExpenseInput>) => Promise<Expense>;
  deleteExpense: (expenseId: string) => Promise<void>;
  addComment: (input: AddCommentInput) => Promise<Comment>;
  updateComment: (commentId: string, body: string) => Promise<Comment>;
  deleteComment: (commentId: string) => Promise<void>;
};

export type AppContextValue = AppDataContextValue & AppActionsContextValue;

type AppIndexes = {
  challengeById: Map<string, Challenge>;
  profileById: Map<string, Profile>;
  membersByChallengeId: Map<string, ChallengeMember[]>;
  expenseById: Map<string, Expense>;
  expenses: Expense[];
  expensesByChallengeId: Map<string, Expense[]>;
  expensesByUserId: Map<string, Expense[]>;
  expensesByChallengeAndUserId: Map<string, Map<string, Expense[]>>;
  commentsByExpenseId: Map<string, Comment[]>;
  crownIdsByChallengeId: Map<string, string[]>;
};

const EMPTY_MEMBERS: ChallengeMember[] = [];
const EMPTY_EXPENSES: Expense[] = [];
const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_IDS: string[] = [];
const AppDataContext = createContext<AppDataContextValue | null>(null);
const AppActionsContext = createContext<AppActionsContextValue | null>(null);
const runtime = getRepositoryRuntime();
const repository: AppRepository = runtime.repository;

export function AppProvider({ children }: PropsWithChildren) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await repository.load());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = repository.subscribe((nextSnapshot) => {
      if (!cancelled) {
        setSnapshot(nextSnapshot);
        setError(null);
        setLoading(false);
      }
    });
    repository
      .load()
      .then((nextSnapshot) => {
        if (!cancelled) setSnapshot(nextSnapshot);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : '데이터를 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

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
    const challengeById = new Map<string, Challenge>();
    const profileById = new Map<string, Profile>();
    const membersByChallengeId = new Map<string, ChallengeMember[]>();
    const expenseById = new Map<string, Expense>();
    const expenses: Expense[] = [];
    const expensesByChallengeId = new Map<string, Expense[]>();
    const expensesByUserId = new Map<string, Expense[]>();
    const expensesByChallengeAndUserId = new Map<
      string,
      Map<string, Expense[]>
    >();
    const commentsByExpenseId = new Map<string, Comment[]>();
    const crownIdsByChallengeId = new Map<string, string[]>();

    snapshot?.challenges.forEach((challenge) => {
      challengeById.set(challenge.id, challenge);
    });
    snapshot?.profiles.forEach((profile) => {
      profileById.set(profile.id, profile);
    });
    snapshot?.members.forEach((member) => {
      appendIndexValue(
        membersByChallengeId,
        member.challengeId,
        member,
      );
    });
    snapshot?.expenses.forEach((expense) => {
      if (expense.deletedAt) return;
      expenseById.set(expense.id, expense);
      expenses.push(expense);
      appendIndexValue(expensesByUserId, expense.userId, expense);
      if (!expense.challengeId) return;
      appendIndexValue(
        expensesByChallengeId,
        expense.challengeId,
        expense,
      );
      let challengeExpenses = expensesByChallengeAndUserId.get(
        expense.challengeId,
      );
      if (!challengeExpenses) {
        challengeExpenses = new Map<string, Expense[]>();
        expensesByChallengeAndUserId.set(
          expense.challengeId,
          challengeExpenses,
        );
      }
      appendIndexValue(challengeExpenses, expense.userId, expense);
    });
    snapshot?.comments.forEach((comment) => {
      appendIndexValue(commentsByExpenseId, comment.expenseId, comment);
    });
    snapshot?.challenges.forEach((challenge) => {
      const crownIds = selectCrownHolders(
        (membersByChallengeId.get(challenge.id) ?? EMPTY_MEMBERS).map(
          (member) => ({
            memberId: member.userId,
            nickname: profileById.get(member.userId)?.nickname ?? '알 수 없음',
            status: member.status,
            appliedLimit: member.appliedLimit,
            eligibleSpending: (
              expensesByChallengeAndUserId
                .get(challenge.id)
                ?.get(member.userId) ?? EMPTY_EXPENSES
            ).reduce((sum, expense) => sum + expense.amount, 0),
          }),
        ),
        'ACTIVE',
      ).holderIds;
      crownIdsByChallengeId.set(challenge.id, [...crownIds]);
    });

    return {
      challengeById,
      profileById,
      membersByChallengeId,
      expenseById,
      expenses,
      expensesByChallengeId,
      expensesByUserId,
      expensesByChallengeAndUserId,
      commentsByExpenseId,
      crownIdsByChallengeId,
    };
  }, [snapshot]);

  const getChallenge = useCallback(
    (challengeId: string) => indexes.challengeById.get(challengeId),
    [indexes],
  );
  const getMembers = useCallback(
    (challengeId: string) =>
      indexes.membersByChallengeId.get(challengeId) ?? EMPTY_MEMBERS,
    [indexes],
  );
  const getExpenses = useCallback(
    (challengeId?: string) =>
      challengeId
        ? indexes.expensesByChallengeId.get(challengeId) ?? EMPTY_EXPENSES
        : indexes.expenses,
    [indexes],
  );
  const getExpense = useCallback(
    (expenseId: string) => indexes.expenseById.get(expenseId),
    [indexes],
  );
  const getUserExpenses = useCallback(
    (userId: string, challengeId?: string) =>
      challengeId
        ? indexes.expensesByChallengeAndUserId
            .get(challengeId)
            ?.get(userId) ?? EMPTY_EXPENSES
        : indexes.expensesByUserId.get(userId) ?? EMPTY_EXPENSES,
    [indexes],
  );
  const getComments = useCallback(
    (expenseId: string) =>
      indexes.commentsByExpenseId.get(expenseId) ?? EMPTY_COMMENTS,
    [indexes],
  );
  const getProfile = useCallback(
    (userId: string) => indexes.profileById.get(userId),
    [indexes],
  );
  const getCrownIds = useCallback(
    (challengeId: string) => {
      const challenge = getChallenge(challengeId);
      if (!challenge) return EMPTY_IDS;
      const phase = getChallengePhase(
        createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate }),
        Date.now(),
      );
      return phase === 'WAITING'
        ? EMPTY_IDS
        : indexes.crownIdsByChallengeId.get(challengeId) ?? EMPTY_IDS;
    },
    [getChallenge, indexes],
  );

  const currentUser = useMemo(
    () =>
      snapshot
        ? indexes.profileById.get(snapshot.currentUserId) ?? null
        : null,
    [indexes, snapshot],
  );
  const activeChallenge = useMemo(() => {
    if (!snapshot) return null;
    const myChallengeIds = new Set(
      snapshot.members
        .filter((member) => member.userId === snapshot.currentUserId && member.status === 'ACTIVE')
        .map((member) => member.challengeId),
    );
    return snapshot.challenges.find((challenge) => myChallengeIds.has(challenge.id) && challenge.phase !== 'ARCHIVED') ?? null;
  }, [snapshot]);
  const archivedChallenges = useMemo(
    () => snapshot?.challenges.filter((challenge) => challenge.phase === 'ARCHIVED') ?? [],
    [snapshot],
  );

  const clearError = useCallback(() => setError(null), []);
  const resetDemo = useCallback(
    () => execute(async () => void setSnapshot(await repository.resetDemo())),
    [execute],
  );
  const createChallenge = useCallback(
    (input: CreateChallengeInput) => execute(() => repository.createChallenge(input)),
    [execute],
  );
  const increaseCapacity = useCallback(
    (challengeId: string, capacity: number) => execute(() => repository.increaseCapacity(challengeId, capacity)),
    [execute],
  );
  const previewInvite = useCallback(
    (code: string) => execute(() => repository.previewInvite(code)),
    [execute],
  );
  const joinChallenge = useCallback(
    (code: string) => execute(() => repository.joinChallenge(code)),
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

  const dataValue = useMemo<AppDataContextValue>(() => ({
    dataMode: runtime.dataMode,
    isConfigured: runtime.isConfigured,
    isSupabaseConfigured: runtime.isSupabaseConfigured,
    snapshot,
    loading,
    error,
    currentUser,
    activeChallenge,
    archivedChallenges,
    getChallenge,
    getMembers,
    getExpense,
    getExpenses,
    getUserExpenses,
    getComments,
    getProfile,
    getCrownIds,
  }), [
    activeChallenge,
    archivedChallenges,
    currentUser,
    error,
    getChallenge,
    getComments,
    getCrownIds,
    getExpense,
    getExpenses,
    getMembers,
    getProfile,
    getUserExpenses,
    loading,
    snapshot,
  ]);

  const actionsValue = useMemo<AppActionsContextValue>(() => ({
    refresh,
    clearError,
    resetDemo,
    createChallenge,
    increaseCapacity,
    previewInvite,
    joinChallenge,
    addExpense,
    updateExpense,
    deleteExpense,
    addComment,
    updateComment,
    deleteComment,
  }), [
    addComment,
    addExpense,
    clearError,
    createChallenge,
    deleteComment,
    deleteExpense,
    increaseCapacity,
    joinChallenge,
    previewInvite,
    refresh,
    resetDemo,
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

export function useApp(): AppContextValue {
  const data = useAppData();
  const actions = useAppActions();
  return useMemo(() => ({ ...data, ...actions }), [actions, data]);
}

function appendIndexValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
