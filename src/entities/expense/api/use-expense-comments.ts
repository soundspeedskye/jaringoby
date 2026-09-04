import type { Comment, CommentMention, CommentReaction, Expense } from '@/shared/api/types';
import type { AppIndexes } from '@/shared/model/app-indexes';
import {
  useIndexedCounts,
  useIndexedList,
  useIndexedListMap,
} from '@/shared/providers/store-hooks';

const pickCommentsByExpenseId = (indexes: AppIndexes) => indexes.commentsByExpenseId;

const pickCommentCountByExpenseId = (indexes: AppIndexes) => indexes.commentCountByExpenseId;

const pickReactionsByCommentId = (indexes: AppIndexes) => indexes.reactionsByCommentId;

const pickMentionsByCommentId = (indexes: AppIndexes) => indexes.mentionsByCommentId;

export function useExpenseComments(expenseId: string | undefined): Comment[] {
  return useIndexedList(pickCommentsByExpenseId, expenseId);
}

export function useCommentCounts(expenses: readonly Expense[]): ReadonlyMap<string, number> {
  return useIndexedCounts(
    pickCommentCountByExpenseId,
    expenses.map((expense) => expense.id),
  );
}

/**
 * 현재 상세 화면에 보이는 댓글의 반응을 comment별로 구독한다.
 * 스토어가 이미 comment별로 그룹해 둔 인덱스 배열 참조를 그대로 노출하므로
 * (평평화→재그룹핑 왕복이 없고) 안 바뀐 댓글의 배열은 참조가 안정적이다.
 */

export function useReactionsByCommentId(
  commentIds: readonly string[],
): ReadonlyMap<string, CommentReaction[]> {
  return useIndexedListMap(pickReactionsByCommentId, commentIds);
}

/** 현재 상세 화면 댓글의 멘션을 comment별로 묶어 노출한다. */
export function useMentionsByCommentId(
  commentIds: readonly string[],
): ReadonlyMap<string, CommentMention[]> {
  return useIndexedListMap(pickMentionsByCommentId, commentIds);
}
