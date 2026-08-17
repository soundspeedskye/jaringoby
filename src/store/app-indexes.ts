import { expenseOfficialAmount, isExpenseVisible } from '@/data/expense-sync';
import type {
  AppSnapshot,
  Comment,
  CommentReaction,
  Expense,
  ExpenseException,
  Period,
  PeriodMember,
  PeriodResult,
  Profile,
  Room,
  RoomMemberStats,
  RoomPost,
  RoomPostComment,
  RoomPostReaction,
} from '@/data/types';
import { collectSettlementExcludedExpenseIds, selectCrownHolders } from '@/domain';

export type AppIndexes = {
  roomById: Map<string, Room>;
  periodById: Map<string, Period>;
  profileById: Map<string, Profile>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expenseById: Map<string, Expense>;
  expensesByPeriodId: Map<string, Expense[]>;
  expensesByUserId: Map<string, Expense[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  /** 방별 피드 지출(삭제 제외), 게시 시각(createdAt) 최신순 정렬. */
  feedExpensesByRoomId: Map<string, Expense[]>;
  commentsByExpenseId: Map<string, Comment[]>;
  commentCountByExpenseId: Map<string, number>;
  reactionsByCommentId: Map<string, CommentReaction[]>;
  postById: Map<string, RoomPost>;
  postsByRoomId: Map<string, RoomPost[]>;
  commentsByPostId: Map<string, RoomPostComment[]>;
  commentCountByPostId: Map<string, number>;
  reactionsByPostId: Map<string, RoomPostReaction[]>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
  statsByRoomId: Map<string, RoomMemberStats[]>;
  crownIdsByPeriodId: Map<string, string[]>;
  exceptionByExpenseId: Map<string, ExpenseException>;
  approvedUserIdsByExpenseId: Map<string, Set<string>>;
  /** 예외가 만장일치로 승인돼 정산에서 빠지는 지출 ID(전 주차 통합). */
  settlementExcludedExpenseIds: Set<string>;
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
  // 피드는 지출·주차 편성 둘 다에 의존한다. 둘 다 그대로면 재사용.
  const feedExpensesByRoomId =
    canReuse &&
    snapshot.expenses === previousSnapshot.expenses &&
    snapshot.periods === previousSnapshot.periods
      ? previousIndexes.feedExpensesByRoomId
      : buildRoomFeedIndex(snapshot.expenses, snapshot.periods);
  const reactionsByCommentId =
    canReuse && snapshot.commentReactions === previousSnapshot.commentReactions
      ? previousIndexes.reactionsByCommentId
      : groupValues(snapshot.commentReactions, (reaction) => reaction.commentId);
  const postIndexes = canReuse && snapshot.roomPosts === previousSnapshot.roomPosts
    ? pickPostIndexes(previousIndexes)
    : buildPostIndexes(snapshot.roomPosts);
  const postCommentIndexes = canReuse && snapshot.roomPostComments === previousSnapshot.roomPostComments
    ? pickPostCommentIndexes(previousIndexes)
    : buildPostCommentIndexes(snapshot.roomPostComments);
  const reactionsByPostId =
    canReuse && snapshot.roomPostReactions === previousSnapshot.roomPostReactions
      ? previousIndexes.reactionsByPostId
      : groupValues(snapshot.roomPostReactions, (reaction) => reaction.postId);
  const exceptionIndexes = canReuse && exceptionInputsAreShared(snapshot, previousSnapshot)
    ? pickExceptionIndexes(previousIndexes)
    : buildExceptionIndexes(snapshot, membersByPeriodId, expenseIndexes.expenseById);
  const resultsByPeriodId =
    canReuse && snapshot.periodResults === previousSnapshot.periodResults
      ? previousIndexes.resultsByPeriodId
      : groupValues(snapshot.periodResults, (result) => result.periodId);
  const statsByRoomId = canReuse && snapshot.memberStats === previousSnapshot.memberStats
    ? previousIndexes.statsByRoomId
    : groupValues(snapshot.memberStats, (stats) => stats.roomId);
  // Finalized periods derive their crowns purely from periodResults, so when
  // those are unchanged their crown arrays can be reused even if expenses moved;
  // only live (unfinalized) periods need recomputing.
  const resultsUnchanged =
    canReuse && snapshot.periodResults === previousSnapshot.periodResults;
  const crownIdsByPeriodId = canReuse && crownInputsAreShared(snapshot, previousSnapshot)
    ? previousIndexes.crownIdsByPeriodId
    : buildCrownIndex({
      snapshot,
      profileById,
      membersByPeriodId,
      expensesByPeriodAndUserId: expenseIndexes.expensesByPeriodAndUserId,
      resultsByPeriodId,
      settlementExcludedExpenseIds: exceptionIndexes.settlementExcludedExpenseIds,
      reuseFinalizedFrom: resultsUnchanged ? previousIndexes?.crownIdsByPeriodId : undefined,
    });

  return {
    roomById,
    periodById,
    profileById,
    membersByPeriodId,
    ...expenseIndexes,
    feedExpensesByRoomId,
    ...commentIndexes,
    reactionsByCommentId,
    ...postIndexes,
    ...postCommentIndexes,
    reactionsByPostId,
    ...exceptionIndexes,
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
    feedExpensesByRoomId: new Map(),
    commentsByExpenseId: new Map(),
    commentCountByExpenseId: new Map(),
    reactionsByCommentId: new Map(),
    postById: new Map(),
    postsByRoomId: new Map(),
    commentsByPostId: new Map(),
    commentCountByPostId: new Map(),
    reactionsByPostId: new Map(),
    resultsByPeriodId: new Map(),
    statsByRoomId: new Map(),
    crownIdsByPeriodId: new Map(),
    exceptionByExpenseId: new Map(),
    approvedUserIdsByExpenseId: new Map(),
    settlementExcludedExpenseIds: new Set(),
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

/**
 * 방별 피드 지출을 미리 계산한다. 셀렉터가 매 스토어 알림마다 전체 지출을
 * 훑는 대신 이 인덱스만 조회하도록. 피드는 삭제된 지출을 숨긴다(pending 삭제
 * 포함, isExpenseVisible보다 엄격). createdAt은 ISO(UTC)라 사전식=시간순.
 */
function buildRoomFeedIndex(
  expenses: Expense[],
  periods: Period[],
): Map<string, Expense[]> {
  const roomIdByPeriodId = new Map<string, string>();
  periods.forEach((period) => roomIdByPeriodId.set(period.id, period.roomId));
  const feedExpensesByRoomId = new Map<string, Expense[]>();
  expenses.forEach((expense) => {
    if (expense.deletedAt || !expense.periodId) return;
    const roomId = roomIdByPeriodId.get(expense.periodId);
    if (!roomId) return;
    appendIndexValue(feedExpensesByRoomId, roomId, expense);
  });
  feedExpensesByRoomId.forEach((roomExpenses) => {
    roomExpenses.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
  return feedExpensesByRoomId;
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

function buildPostIndexes(posts: RoomPost[]): Pick<AppIndexes, 'postById' | 'postsByRoomId'> {
  const postById = new Map<string, RoomPost>();
  const postsByRoomId = new Map<string, RoomPost[]>();
  posts.forEach((post) => {
    postById.set(post.id, post);
    if (!post.deletedAt) appendIndexValue(postsByRoomId, post.roomId, post);
  });
  postsByRoomId.forEach((roomPosts) => {
    roomPosts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
  return { postById, postsByRoomId };
}

function buildPostCommentIndexes(comments: RoomPostComment[]): Pick<
  AppIndexes,
  'commentsByPostId' | 'commentCountByPostId'
> {
  const commentsByPostId = new Map<string, RoomPostComment[]>();
  const commentCountByPostId = new Map<string, number>();
  comments.forEach((comment) => {
    appendIndexValue(commentsByPostId, comment.postId, comment);
    if (!comment.deletedAt) {
      commentCountByPostId.set(
        comment.postId,
        (commentCountByPostId.get(comment.postId) ?? 0) + 1,
      );
    }
  });
  return { commentsByPostId, commentCountByPostId };
}

function buildExceptionIndexes(
  snapshot: AppSnapshot,
  membersByPeriodId: Map<string, PeriodMember[]>,
  expenseById: Map<string, Expense>,
): Pick<
  AppIndexes,
  'exceptionByExpenseId' | 'approvedUserIdsByExpenseId' | 'settlementExcludedExpenseIds'
> {
  const exceptionByExpenseId = new Map<string, ExpenseException>();
  const approvedUserIdsByExpenseId = new Map<string, Set<string>>();

  snapshot.expenseExceptions.forEach((exception) => {
    exceptionByExpenseId.set(exception.expenseId, exception);
  });
  snapshot.expenseExceptionApprovals.forEach((approval) => {
    let approvers = approvedUserIdsByExpenseId.get(approval.expenseId);
    if (!approvers) {
      approvers = new Set<string>();
      approvedUserIdsByExpenseId.set(approval.expenseId, approvers);
    }
    approvers.add(approval.userId);
  });

  // 라이브 표시는 컷오프 없이 현재까지의 승인으로 판정한다. C 마감 적용은
  // 서버·로컬 finalize에서만(이미 승인은 C 이후 차단되므로 결과는 동일).
  const settlementExcludedExpenseIds = collectSettlementExcludedExpenseIds({
    exceptionExpenseIds: exceptionByExpenseId.keys(),
    approvals: snapshot.expenseExceptionApprovals,
    activeMemberIdsOf: (expenseId) => {
      const expense = expenseById.get(expenseId);
      if (!expense || !expense.periodId) return undefined;
      return (membersByPeriodId.get(expense.periodId) ?? EMPTY_MEMBERS)
        .filter((member) => member.status === 'ACTIVE')
        .map((member) => member.userId);
    },
  });

  return { exceptionByExpenseId, approvedUserIdsByExpenseId, settlementExcludedExpenseIds };
}

function buildCrownIndex(input: {
  snapshot: AppSnapshot;
  profileById: Map<string, Profile>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
  settlementExcludedExpenseIds: Set<string>;
  /** Prior crowns to reuse for finalized periods when periodResults are unchanged. */
  reuseFinalizedFrom?: Map<string, string[]>;
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
      const reused = input.reuseFinalizedFrom?.get(period.id);
      crownIdsByPeriodId.set(
        period.id,
        reused ?? results.filter((result) => result.isCrown).map((result) => result.userId),
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
        ).reduce(
          (sum, expense) =>
            input.settlementExcludedExpenseIds.has(expense.id)
              ? sum
              : sum + expenseOfficialAmount(expense),
          0,
        ),
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
    && snapshot.expenses === previousSnapshot.expenses
    && snapshot.expenseExceptions === previousSnapshot.expenseExceptions
    && snapshot.expenseExceptionApprovals === previousSnapshot.expenseExceptionApprovals;
}

function exceptionInputsAreShared(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot,
): boolean {
  return snapshot.expenseExceptions === previousSnapshot.expenseExceptions
    && snapshot.expenseExceptionApprovals === previousSnapshot.expenseExceptionApprovals
    && snapshot.periodMembers === previousSnapshot.periodMembers
    && snapshot.expenses === previousSnapshot.expenses;
}

function pickExceptionIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'exceptionByExpenseId' | 'approvedUserIdsByExpenseId' | 'settlementExcludedExpenseIds'
> {
  return {
    exceptionByExpenseId: indexes.exceptionByExpenseId,
    approvedUserIdsByExpenseId: indexes.approvedUserIdsByExpenseId,
    settlementExcludedExpenseIds: indexes.settlementExcludedExpenseIds,
  };
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

function pickPostIndexes(indexes: AppIndexes): Pick<AppIndexes, 'postById' | 'postsByRoomId'> {
  return { postById: indexes.postById, postsByRoomId: indexes.postsByRoomId };
}

function pickPostCommentIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'commentsByPostId' | 'commentCountByPostId'
> {
  return {
    commentsByPostId: indexes.commentsByPostId,
    commentCountByPostId: indexes.commentCountByPostId,
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
