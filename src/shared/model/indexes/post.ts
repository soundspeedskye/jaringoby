import type {
  RoomPost,
  RoomPostComment,
  RoomPostPollOption,
  RoomPostPollVote,
} from '@/shared/api/types';
import type { AppIndexes } from './types';
import { appendIndexValue } from './util';

export function buildPostIndexes(posts: RoomPost[]): Pick<AppIndexes, 'postById' | 'postsByRoomId'> {
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

export function buildPostCommentIndexes(comments: RoomPostComment[]): Pick<
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

export function pickPostIndexes(indexes: AppIndexes): Pick<AppIndexes, 'postById' | 'postsByRoomId'> {
  return { postById: indexes.postById, postsByRoomId: indexes.postsByRoomId };
}

export function pickPostCommentIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'commentsByPostId' | 'commentCountByPostId'
> {
  return {
    commentsByPostId: indexes.commentsByPostId,
    commentCountByPostId: indexes.commentCountByPostId,
  };
}

export function buildPostPollIndexes(
  options: RoomPostPollOption[],
  votes: RoomPostPollVote[],
): Pick<AppIndexes, 'pollOptionsByPostId' | 'pollVotesByPostId'> {
  const pollOptionsByPostId = new Map<string, RoomPostPollOption[]>();
  options.forEach((option) => appendIndexValue(pollOptionsByPostId, option.postId, option));
  pollOptionsByPostId.forEach((postOptions) => {
    postOptions.sort((left, right) => left.position - right.position);
  });
  return {
    pollOptionsByPostId,
    pollVotesByPostId: groupPollVotes(votes),
  };
}

export function pickPostPollIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'pollOptionsByPostId' | 'pollVotesByPostId'
> {
  return {
    pollOptionsByPostId: indexes.pollOptionsByPostId,
    pollVotesByPostId: indexes.pollVotesByPostId,
  };
}

function groupPollVotes(votes: RoomPostPollVote[]): Map<string, RoomPostPollVote[]> {
  const grouped = new Map<string, RoomPostPollVote[]>();
  votes.forEach((vote) => appendIndexValue(grouped, vote.postId, vote));
  return grouped;
}
