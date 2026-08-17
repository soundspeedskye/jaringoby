import { useCallback } from 'react';
import type { Comment, CommentReaction, Expense } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import {
  shallowMapEqual,
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';
import {
  shallowArrayMapEqual,
  useIndexedArray,
  useStableIds,
} from '@/shared/providers/store-hooks';

const EMPTY_COMMENTS: Comment[] = [];

const EMPTY_REACTIONS_BY_COMMENT: ReadonlyMap<string, CommentReaction[]> = new Map();

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

/**
 * 현재 상세 화면에 보이는 댓글의 반응을 comment별로 구독한다.
 * 스토어가 이미 comment별로 그룹해 둔 인덱스 배열 참조를 그대로 노출하므로
 * (평평화→재그룹핑 왕복이 없고) 안 바뀐 댓글의 배열은 참조가 안정적이다.
 */

export function useReactionsByCommentId(
  commentIds: readonly string[],
): ReadonlyMap<string, CommentReaction[]> {
  const normalizedIds = useStableIds(commentIds);
  const selector = useCallback((state: AppStoreState) => {
    if (normalizedIds.length === 0) return EMPTY_REACTIONS_BY_COMMENT;
    const grouped = new Map<string, CommentReaction[]>();
    normalizedIds.forEach((commentId) => {
      const reactions = state.indexes.reactionsByCommentId.get(commentId);
      if (reactions) grouped.set(commentId, reactions);
    });
    return grouped.size ? grouped : EMPTY_REACTIONS_BY_COMMENT;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowArrayMapEqual);
}
