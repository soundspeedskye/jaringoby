import type { AppSnapshot } from '@/shared/api/types';

import { buildCommentIndexes, pickCommentIndexes } from './indexes/comment';
import { buildCrownIndex, crownInputsAreShared } from './indexes/crown';
import {
  buildExceptionIndexes,
  exceptionInputsAreShared,
  pickExceptionIndexes,
} from './indexes/exception';
import { buildExpenseIndexes, pickExpenseIndexes } from './indexes/expense';
import {
  buildPostCommentIndexes,
  buildPostIndexes,
  buildPostPollIndexes,
  pickPostCommentIndexes,
  pickPostIndexes,
  pickPostPollIndexes,
} from './indexes/post';
import type { AppIndexes } from './indexes/types';
import { groupValues, indexById } from './indexes/util';

export type { AppIndexes } from './indexes/types';

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
  const pollIndexes = canReuse
    && snapshot.roomPostPollOptions === previousSnapshot.roomPostPollOptions
    && snapshot.roomPostPollVotes === previousSnapshot.roomPostPollVotes
    ? pickPostPollIndexes(previousIndexes)
    : buildPostPollIndexes(snapshot.roomPostPollOptions, snapshot.roomPostPollVotes);
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
    ...commentIndexes,
    reactionsByCommentId,
    ...postIndexes,
    ...postCommentIndexes,
    reactionsByPostId,
    ...pollIndexes,
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
    expensesByPeriodAndUserId: new Map(),
    commentsByExpenseId: new Map(),
    commentCountByExpenseId: new Map(),
    reactionsByCommentId: new Map(),
    postById: new Map(),
    postsByRoomId: new Map(),
    commentsByPostId: new Map(),
    commentCountByPostId: new Map(),
    reactionsByPostId: new Map(),
    pollOptionsByPostId: new Map(),
    pollVotesByPostId: new Map(),
    resultsByPeriodId: new Map(),
    statsByRoomId: new Map(),
    crownIdsByPeriodId: new Map(),
    exceptionByExpenseId: new Map(),
    approvedUserIdsByExpenseId: new Map(),
    settlementExcludedExpenseIds: new Set(),
  };
}
