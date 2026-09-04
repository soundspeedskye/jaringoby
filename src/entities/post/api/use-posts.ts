import { useCallback } from 'react';
import type {
  RoomPost,
  RoomPostComment,
  RoomPostPollOption,
  RoomPostPollVote,
  RoomPostReaction,
} from '@/shared/api/types';
import type { AppIndexes } from '@/shared/model/app-indexes';
import type { AppStoreState } from '@/shared/model/app-store';
import {
  shallowSetEqual,
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';
import {
  useIndexedCounts,
  useIndexedList,
  useIndexedListMap,
  useIndexedValue,
} from '@/shared/providers/store-hooks';

const EMPTY_POSTS: RoomPost[] = [];

const EMPTY_UNREAD_IDS: ReadonlySet<string> = new Set<string>();

const pickPostById = (indexes: AppIndexes) => indexes.postById;

const pickPostsByRoomId = (indexes: AppIndexes) => indexes.postsByRoomId;

const pickCommentsByPostId = (indexes: AppIndexes) => indexes.commentsByPostId;

const pickCommentCountByPostId = (indexes: AppIndexes) => indexes.commentCountByPostId;

const pickReactionsByPostId = (indexes: AppIndexes) => indexes.reactionsByPostId;

const pickPollOptionsByPostId = (indexes: AppIndexes) => indexes.pollOptionsByPostId;

const pickPollVotesByPostId = (indexes: AppIndexes) => indexes.pollVotesByPostId;

export function useRoomPosts(roomId: string | undefined): RoomPost[] {
  return useIndexedList(pickPostsByRoomId, roomId);
}

export function useRoomPost(postId: string | undefined): RoomPost | undefined {
  return useIndexedValue(pickPostById, postId);
}

export function useRoomPostComments(postId: string | undefined): RoomPostComment[] {
  return useIndexedList(pickCommentsByPostId, postId);
}

export function useLatestRoomNotice(roomId: string | undefined): RoomPost | undefined {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => (
      roomId
        ? (state.indexes.postsByRoomId.get(roomId) ?? EMPTY_POSTS)
          .find((post) => post.kind === 'NOTICE' && !post.deletedAt)
        : undefined
    ), [roomId]),
  );
}

export function useReactionsByPostId(
  postIds: readonly string[],
): ReadonlyMap<string, RoomPostReaction[]> {
  return useIndexedListMap(pickReactionsByPostId, postIds);
}

export function useRoomPostCommentCounts(posts: readonly RoomPost[]): ReadonlyMap<string, number> {
  return useIndexedCounts(
    pickCommentCountByPostId,
    posts.map((post) => post.id),
  );
}

/** 현재 멤버가 상세를 열어 읽음 처리하지 않은 글 ID. 본인 글은 새 글로 보이지 않는다. */
export function useUnreadRoomPostIds(
  roomId: string | undefined,
  currentUserId: string | undefined,
  periodId?: string,
  joinedAt?: string,
): ReadonlySet<string> {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => {
      if (!roomId || !currentUserId) return EMPTY_UNREAD_IDS;
      const unread = new Set<string>();
      (state.indexes.postsByRoomId.get(roomId) ?? EMPTY_POSTS).forEach((post) => {
        if (post.authorId === currentUserId || post.deletedAt) return;
        if (periodId && post.periodId !== periodId) return;
        if (joinedAt && post.createdAt < joinedAt) return;
        if (state.indexes.readPostIds.has(post.id)) return;
        if (state.localReads.postIds.has(post.id)) return;
        unread.add(post.id);
      });
      return unread.size ? unread : EMPTY_UNREAD_IDS;
    }, [currentUserId, joinedAt, periodId, roomId]),
    shallowSetEqual,
  );
}

export function useRoomPostPollOptions(postId: string | undefined): RoomPostPollOption[] {
  return useIndexedList(pickPollOptionsByPostId, postId);
}

export function useRoomPostPollVotes(postId: string | undefined): RoomPostPollVote[] {
  return useIndexedList(pickPollVotesByPostId, postId);
}
