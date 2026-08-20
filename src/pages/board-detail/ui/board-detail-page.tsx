import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { RoomPostReactionPills } from '@/entities/post/ui/post-reaction-pills';
import { RoomPostCard } from '@/entities/post/ui/room-post-card';
import { RoomPostPoll } from '@/entities/post/ui/room-post-poll';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { PrimaryButton } from '@/shared/ui/primary-button';
import { ScreenFrame } from '@/shared/ui/screen';
import { spacing } from '@/shared/config/design';
import type { RoomPostReaction, RoomPostReactionEmoji } from '@/shared/api/types';
import { useAppActions } from '@/shared/providers/app-actions-provider';
import { useCurrentUser, useProfiles } from '@/entities/member/api/use-members';
import { useRoom } from '@/entities/room/api/use-rooms';
import {
  useReactionsByPostId,
  useRoomPost,
  useRoomPostComments,
  useRoomPostPollOptions,
  useRoomPostPollVotes,
} from '@/entities/post/api/use-posts';
import { CommentThread, type ThreadActions, type ThreadFeatures, type ThreadMessage } from '@/widgets/comment-thread';

const ROOM_POST_COMMENT_FEATURES: ThreadFeatures = {
  replies: false,
  reactions: false,
  maxLength: 300,
  placeholder: '댓글 남기기…',
};

const EMPTY_REACTIONS: RoomPostReaction[] = [];

export function BoardDetailPage() {
  const router = useRouter();
  const { id: postId } = useLocalSearchParams<'/room/board/[id]'>();
  const post = useRoomPost(postId);
  const currentUser = useCurrentUser();
  const room = useRoom(post?.roomId);
  const allComments = useRoomPostComments(post?.id);
  const comments = useMemo(
    () => [...allComments].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [allComments],
  );
  const threadMessages = useMemo<ThreadMessage[]>(
    () => comments.map((comment) => ({
      id: comment.id,
      authorId: comment.authorId,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      deletedAt: comment.deletedAt,
    })),
    [comments],
  );
  const profileUserIds = useMemo(
    () => [
      ...(post ? [post.authorId] : []),
      ...comments.map((comment) => comment.authorId),
    ],
    [comments, post],
  );
  const profiles = useProfiles(profileUserIds);
  const reactionsByPostId = useReactionsByPostId(post ? [post.id] : []);
  const pollOptions = useRoomPostPollOptions(post?.id);
  const pollVotes = useRoomPostPollVotes(post?.id);
  const {
    addRoomPostComment,
    deleteRoomPostComment,
    toggleRoomPostReaction,
    updateRoomPostComment,
    voteRoomPostPoll,
  } = useAppActions();

  const returnToBoard = useCallback(() => router.replace('/room/board'), [router]);
  const createComment = useCallback(
    (input: { body: string; clientRequestId: string; replyToId?: string }) => {
      if (!post) throw new Error('게시글을 찾을 수 없어요.');
      return addRoomPostComment({ ...input, postId: post.id });
    },
    [addRoomPostComment, post],
  );
  const canDeleteComment = useCallback(
    (comment: ThreadMessage) =>
      comment.authorId === currentUser?.id || room?.ownerId === currentUser?.id,
    [currentUser?.id, room?.ownerId],
  );
  const canEditComment = useCallback(
    (comment: ThreadMessage) => comment.authorId === currentUser?.id,
    [currentUser?.id],
  );
  const toggleReaction = useCallback(
    (emoji: RoomPostReactionEmoji) => {
      if (post) void toggleRoomPostReaction(post.id, emoji);
    },
    [post, toggleRoomPostReaction],
  );
  const threadActions = useMemo<ThreadActions>(() => ({
    create: createComment,
    update: updateRoomPostComment,
    remove: deleteRoomPostComment,
  }), [createComment, deleteRoomPostComment, updateRoomPostComment]);
  if (!post || post.deletedAt) {
    return (
      <ScreenFrame testID="room-board-detail-screen">
        <View style={styles.emptyScreen}>
          <PageHeader onBack={returnToBoard} title="냥냥톡톡" />
          <EmptyState
            action={<PrimaryButton label="목록으로 가기" onPress={returnToBoard} variant="secondary" />}
            icon="chat-remove-outline"
            title="삭제되었거나 없는 냥톡이에요."
          />
        </View>
      </ScreenFrame>
    );
  }

  const author = profiles.get(post.authorId);
  const canMutateComments = Boolean(currentUser && room?.status === 'OPEN');

  return (
    <ScreenFrame
      fixedHeader={<PageHeader bottomSpacing="md" onBack={returnToBoard} title="냥냥톡톡" />}
      testID="room-board-detail-screen">
      <CommentThread
        actions={threadActions}
        canDelete={canDeleteComment}
        canEdit={canEditComment}
        canMutate={canMutateComments}
        comments={threadMessages}
        currentUserId={currentUser?.id}
        features={ROOM_POST_COMMENT_FEATURES}
        header={
          <>
            <RoomPostCard
              author={author}
              dateLabel={formatFullDate(post.createdAt)}
              footer={(
                <RoomPostReactionPills
                  currentUserId={currentUser?.id}
                  onToggle={toggleReaction}
                  reactions={reactionsByPostId.get(post.id) ?? EMPTY_REACTIONS}
                />
              )}
              post={post}
              variant="detail"
            />
            {post.kind === 'POLL' ? (
              <RoomPostPoll
                canVote={canMutateComments}
                currentUserId={currentUser?.id}
                onVote={(optionId) => voteRoomPostPoll(post.id, optionId)}
                options={pollOptions}
                votes={pollVotes}
              />
            ) : null}
          </>
        }
        profilesById={profiles}
      />
    </ScreenFrame>
  );
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(value));
}

const styles = StyleSheet.create({
  emptyScreen: { flex: 1, paddingHorizontal: spacing.xl },
});
