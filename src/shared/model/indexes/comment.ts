import type { Comment } from '@/shared/api/types';
import type { AppIndexes } from './types';
import { appendIndexValue } from './util';

export function buildCommentIndexes(comments: Comment[]): Pick<
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

export function pickCommentIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'commentsByExpenseId' | 'commentCountByExpenseId'
> {
  return {
    commentsByExpenseId: indexes.commentsByExpenseId,
    commentCountByExpenseId: indexes.commentCountByExpenseId,
  };
}
