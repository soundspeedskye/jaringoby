import { useCallback } from 'react';
import type {
  RoomPost,
  RoomPostComment,
  RoomPostPollOption,
  RoomPostPollVote,
  RoomPostReaction,
} from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import {
  shallowMapEqual,
  shallowSetEqual,
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';
import {
  shallowArrayMapEqual,
  useIndexedArray,
  useStableIds,
} from '@/shared/providers/store-hooks';

const EMPTY_POSTS: RoomPost[] = [];

const EMPTY_UNREAD_IDS: ReadonlySet<string> = new Set<string>();

const EMPTY_POST_COMMENTS: RoomPostComment[] = [];

const EMPTY_REACTIONS_BY_POST: ReadonlyMap<string, RoomPostReaction[]> = new Map();

const EMPTY_POLL_OPTIONS: RoomPostPollOption[] = [];

const EMPTY_POLL_VOTES: RoomPostPollVote[] = [];

export function useRoomPosts(roomId: string | undefined): RoomPost[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        roomId ? state.indexes.postsByRoomId.get(roomId) ?? EMPTY_POSTS : EMPTY_POSTS
      ),
      [roomId],
    ),
  );
}

export function useRoomPost(postId: string | undefined): RoomPost | undefined {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => (
      postId ? state.indexes.postById.get(postId) : undefined
    ), [postId]),
  );
}

export function useRoomPostComments(postId: string | undefined): RoomPostComment[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        postId ? state.indexes.commentsByPostId.get(postId) ?? EMPTY_POST_COMMENTS : EMPTY_POST_COMMENTS
      ),
      [postId],
    ),
  );
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
  const normalizedIds = useStableIds(postIds);
  const selector = useCallback((state: AppStoreState) => {
    if (normalizedIds.length === 0) return EMPTY_REACTIONS_BY_POST;
    const grouped = new Map<string, RoomPostReaction[]>();
    normalizedIds.forEach((postId) => {
      const reactions = state.indexes.reactionsByPostId.get(postId);
      if (reactions) grouped.set(postId, reactions);
    });
    return grouped.size ? grouped : EMPTY_REACTIONS_BY_POST;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowArrayMapEqual);
}

export function useRoomPostCommentCounts(posts: readonly RoomPost[]): ReadonlyMap<string, number> {
  const selector = useCallback((state: AppStoreState) => {
    const counts = new Map<string, number>();
    posts.forEach((post) => {
      const count = state.indexes.commentCountByPostId.get(post.id);
      if (count) counts.set(post.id, count);
    });
    return counts;
  }, [posts]);
  return useAppStoreSelector(selector, shallowMapEqual);
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
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        postId ? state.indexes.pollOptionsByPostId.get(postId) ?? EMPTY_POLL_OPTIONS : EMPTY_POLL_OPTIONS
      ),
      [postId],
    ),
  );
}

export function useRoomPostPollVotes(postId: string | undefined): RoomPostPollVote[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        postId ? state.indexes.pollVotesByPostId.get(postId) ?? EMPTY_POLL_VOTES : EMPTY_POLL_VOTES
      ),
      [postId],
    ),
  );
}
