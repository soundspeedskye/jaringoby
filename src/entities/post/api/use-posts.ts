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
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';
import {
  shallowArrayMapEqual,
  useIndexedArray,
  useStableIds,
} from '@/shared/providers/store-hooks';

const EMPTY_POSTS: RoomPost[] = [];

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
          .find((post) => post.kind === 'NOTICE')
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
