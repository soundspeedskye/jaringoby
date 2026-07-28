import { expenseOfficialAmount, isExpenseVisible } from '@/data/expense-sync';
import type {
  AppSnapshot,
  Comment,
  Expense,
  Period,
  PeriodMember,
  PeriodResult,
  Profile,
  Room,
  RoomMemberStats,
} from '@/data/types';
import { selectCrownHolders } from '@/domain';

export type AppIndexes = {
  roomById: Map<string, Room>;
  periodById: Map<string, Period>;
  profileById: Map<string, Profile>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expenseById: Map<string, Expense>;
  expensesByPeriodId: Map<string, Expense[]>;
  expensesByUserId: Map<string, Expense[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  commentsByExpenseId: Map<string, Comment[]>;
  commentCountByExpenseId: Map<string, number>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
  statsByRoomId: Map<string, RoomMemberStats[]>;
  crownIdsByPeriodId: Map<string, string[]>;
};

const EMPTY_MEMBERS: PeriodMember[] = [];
const EMPTY_EXPENSES: Expense[] = [];

export function buildAppIndexes(
  snapshot: AppSnapshot | null,
  previousSnapshot: AppSnapshot | null = null,
  previousIndexes?: AppIndexes,
): AppIndexes {
  if (!snapshot) return createEmptyIndexes();

  const canReuse = previousSnapshot !== null && previousIndexes !== undefined;
  const roomById = canReuse && snapshot.rooms === previousSnapshot.rooms
    ? previousIndexes.roomById
    : indexById(snapshot.rooms);
  const periodById = canReuse && snapshot.periods === previousSnapshot.periods
    ? previousIndexes.periodById
    : indexById(snapshot.periods);
  const profileById = canReuse && snapshot.profiles === previousSnapshot.profiles
    ? previousIndexes.profileById
    : indexById(snapshot.profiles);
  const membersByPeriodId =
    canReuse && snapshot.periodMembers === previousSnapshot.periodMembers
      ? previousIndexes.membersByPeriodId
      : groupValues(snapshot.periodMembers, (member) => member.periodId);
  const expenseIndexes = canReuse && snapshot.expenses === previousSnapshot.expenses
    ? pickExpenseIndexes(previousIndexes)
    : buildExpenseIndexes(snapshot.expenses);
  const commentIndexes = canReuse && snapshot.comments === previousSnapshot.comments
    ? pickCommentIndexes(previousIndexes)
    : buildCommentIndexes(snapshot.comments);
  const resultsByPeriodId =
    canReuse && snapshot.periodResults === previousSnapshot.periodResults
      ? previousIndexes.resultsByPeriodId
      : groupValues(snapshot.periodResults, (result) => result.periodId);
  const statsByRoomId = canReuse && snapshot.memberStats === previousSnapshot.memberStats
    ? previousIndexes.statsByRoomId
    : groupValues(snapshot.memberStats, (stats) => stats.roomId);
  const crownIdsByPeriodId = canReuse && crownInputsAreShared(snapshot, previousSnapshot)
    ? previousIndexes.crownIdsByPeriodId
    : buildCrownIndex({
      snapshot,
      profileById,
      membersByPeriodId,
      expensesByPeriodAndUserId: expenseIndexes.expensesByPeriodAndUserId,
      resultsByPeriodId,
    });

  return {
    roomById,
    periodById,
    profileById,
    membersByPeriodId,
    ...expenseIndexes,
    ...commentIndexes,
    resultsByPeriodId,
    statsByRoomId,
    crownIdsByPeriodId,
  };
}

function createEmptyIndexes(): AppIndexes {
  return {
    roomById: new Map(),
    periodById: new Map(),
    profileById: new Map(),
    membersByPeriodId: new Map(),
    expenseById: new Map(),
    expensesByPeriodId: new Map(),
    expensesByUserId: new Map(),
    expensesByPeriodAndUserId: new Map(),
    commentsByExpenseId: new Map(),
    commentCountByExpenseId: new Map(),
    resultsByPeriodId: new Map(),
    statsByRoomId: new Map(),
    crownIdsByPeriodId: new Map(),
  };
}

function buildExpenseIndexes(expenses: Expense[]): Pick<
  AppIndexes,
  'expenseById' | 'expensesByPeriodId' | 'expensesByUserId' | 'expensesByPeriodAndUserId'
> {
  const expenseById = new Map<string, Expense>();
  const expensesByPeriodId = new Map<string, Expense[]>();
  const expensesByUserId = new Map<string, Expense[]>();
  const expensesByPeriodAndUserId = new Map<string, Map<string, Expense[]>>();

  expenses.forEach((expense) => {
    if (!isExpenseVisible(expense)) return;
    expenseById.set(expense.id, expense);
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

  return {
    expenseById,
    expensesByPeriodId,
    expensesByUserId,
    expensesByPeriodAndUserId,
  };
}

function buildCommentIndexes(comments: Comment[]): Pick<
  AppIndexes,
  'commentsByExpenseId' | 'commentCountByExpenseId'
> {
  const commentsByExpenseId = new Map<string, Comment[]>();
  const commentCountByExpenseId = new Map<string, number>();
  comments.forEach((comment) => {
    appendIndexValue(commentsByExpenseId, comment.expenseId, comment);
    if (!comment.deletedAt) {
      commentCountByExpenseId.set(
        comment.expenseId,
        (commentCountByExpenseId.get(comment.expenseId) ?? 0) + 1,
      );
    }
  });

  return { commentsByExpenseId, commentCountByExpenseId };
}

function buildCrownIndex(input: {
  snapshot: AppSnapshot;
  profileById: Map<string, Profile>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
}): Map<string, string[]> {
  const crownIdsByPeriodId = new Map<string, string[]>();
  input.snapshot.periods.forEach((period) => {
    const {
      expensesByPeriodAndUserId,
      membersByPeriodId,
      profileById,
      resultsByPeriodId,
    } = input;
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

  return crownIdsByPeriodId;
}

function crownInputsAreShared(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot,
): boolean {
  return snapshot.periods === previousSnapshot.periods
    && snapshot.periodResults === previousSnapshot.periodResults
    && snapshot.periodMembers === previousSnapshot.periodMembers
    && snapshot.profiles === previousSnapshot.profiles
    && snapshot.expenses === previousSnapshot.expenses;
}

function pickExpenseIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'expenseById' | 'expensesByPeriodId' | 'expensesByUserId' | 'expensesByPeriodAndUserId'
> {
  return {
    expenseById: indexes.expenseById,
    expensesByPeriodId: indexes.expensesByPeriodId,
    expensesByUserId: indexes.expensesByUserId,
    expensesByPeriodAndUserId: indexes.expensesByPeriodAndUserId,
  };
}

function pickCommentIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'commentsByExpenseId' | 'commentCountByExpenseId'
> {
  return {
    commentsByExpenseId: indexes.commentsByExpenseId,
    commentCountByExpenseId: indexes.commentCountByExpenseId,
  };
}

function indexById<T extends { id: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function groupValues<K, V>(values: V[], keyOf: (value: V) => K): Map<K, V[]> {
  const grouped = new Map<K, V[]>();
  values.forEach((value) => appendIndexValue(grouped, keyOf(value), value));
  return grouped;
}

function appendIndexValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
