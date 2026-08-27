import type { AppSnapshot } from '@/shared/api/types';
import type { AppIndexes } from './types';

/**
 * 현재 사용자가 상세를 열어 읽은 지출·게시글 ID.
 * 서버가 RLS로 본인 행만 내려주지만, 다른 사람 행이 섞여도 안전하도록 한 번 더 거른다.
 */
export function buildReadIndexes(snapshot: AppSnapshot): Pick<
  AppIndexes,
  'readExpenseIds' | 'readPostIds'
> {
  const userId = snapshot.currentUserId;
  const readExpenseIds = new Set<string>();
  (snapshot.expenseReads ?? []).forEach((read) => {
    if (read.userId === userId) readExpenseIds.add(read.expenseId);
  });
  const readPostIds = new Set<string>();
  (snapshot.roomPostReads ?? []).forEach((read) => {
    if (read.userId === userId) readPostIds.add(read.postId);
  });
  return { readExpenseIds, readPostIds };
}

export function pickReadIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'readExpenseIds' | 'readPostIds'
> {
  return {
    readExpenseIds: indexes.readExpenseIds,
    readPostIds: indexes.readPostIds,
  };
}

export function readInputsAreShared(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot,
): boolean {
  return snapshot.currentUserId === previousSnapshot.currentUserId
    && snapshot.expenseReads === previousSnapshot.expenseReads
    && snapshot.roomPostReads === previousSnapshot.roomPostReads;
}
