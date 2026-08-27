import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useCurrentUser, useProfiles } from "@/entities/member/api/use-members";
import {
  useReactionsByPostId,
  useRoomPost,
  useRoomPostComments,
  useRoomPostPollOptions,
  useRoomPostPollVotes,
} from "@/entities/post/api/use-posts";
import { RoomPostReactionPills } from "@/entities/post/ui/post-reaction-pills";
import { RoomPostCard } from "@/entities/post/ui/room-post-card";
import { RoomPostPoll } from "@/entities/post/ui/room-post-poll";
import { useRoom } from "@/entities/room/api/use-rooms";
import type {
  RoomPostReaction,
  RoomPostReactionEmoji,
} from "@/shared/api/types";
import { palette, spacing } from "@/shared/config/design";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { ScreenFrame } from "@/shared/ui/screen";
import {
  CommentThread,
  type ThreadActions,
  type ThreadFeatures,
  type ThreadMessage,
} from "@/widgets/comment-thread";

const ROOM_POST_COMMENT_FEATURES: ThreadFeatures = {
  replies: false,
  reactions: false,
  maxLength: 300,
  placeholder: "댓글 남기기…",
};

const EMPTY_REACTIONS: RoomPostReaction[] = [];

export function BoardDetailPage() {
  const router = useRouter();
  const refreshControl = usePullToRefreshControl();
  const { id: postId } = useLocalSearchParams<"/room/board/[id]">();
  const post = useRoomPost(postId);
  const currentUser = useCurrentUser();
  const room = useRoom(post?.roomId);
  const allComments = useRoomPostComments(post?.id);
  const comments = useMemo(
    () =>
      [...allComments].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    [allComments],
  );
  const threadMessages = useMemo<ThreadMessage[]>(
    () =>
      comments.map((comment) => ({
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
  const { showDialog } = useAppDialog();
  const {
    addRoomPostComment,
    deleteRoomPostComment,
    deleteRoomPost,
    markRoomPostRead,
    toggleRoomPostReaction,
    updateRoomPostComment,
    voteRoomPostPoll,
  } = useAppActions();

  useEffect(() => {
    if (post?.id) void markRoomPostRead(post.id);
  }, [markRoomPostRead, post?.id]);

  const returnFromPost = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/room/board");
  }, [router]);
  const createComment = useCallback(
    (input: { body: string; clientRequestId: string; replyToId?: string }) => {
      if (!post) throw new Error("게시글을 찾을 수 없어요.");
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
  const canEditPost = Boolean(
    post &&
    currentUser &&
    room?.status === "OPEN" &&
    (post.authorId === currentUser.id ||
      (post.kind === "NOTICE" && room.ownerId === currentUser.id)),
  );
  const canDeletePost = Boolean(
    post &&
    currentUser &&
    room?.status === "OPEN" &&
    (post.authorId === currentUser.id || room.ownerId === currentUser.id),
  );
  const confirmDeletePost = useCallback(() => {
    if (!post) return;
    showDialog("게시글을 삭제할까요?", "삭제 후 복구할 수 없어요.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          void deleteRoomPost(post.id)
            .then(() => router.replace("/room/board"))
            .catch((reason) =>
              showDialog(
                "게시글을 삭제하지 못했어요.",
                reason instanceof Error
                  ? reason.message
                  : "잠시 후 다시 시도해 주세요.",
              ),
            );
        },
      },
    ]);
  }, [deleteRoomPost, post, router, showDialog]);
  const openPostActions = useCallback(() => {
    if (!post) return;
    showDialog(undefined, undefined, [
      ...(canEditPost
        ? [
            {
              text: "수정",
              onPress: () => router.push(`/room/board/${post.id}/edit`),
            },
          ]
        : []),
      ...(canDeletePost
        ? [
            {
              text: "삭제",
              style: "destructive" as const,
              onPress: confirmDeletePost,
            },
          ]
        : []),
      { text: "취소", style: "cancel" as const },
    ]);
  }, [canDeletePost, canEditPost, confirmDeletePost, post, router, showDialog]);
  const toggleReaction = useCallback(
    (emoji: RoomPostReactionEmoji) => {
      if (post) void toggleRoomPostReaction(post.id, emoji);
    },
    [post, toggleRoomPostReaction],
  );
  const threadActions = useMemo<ThreadActions>(
    () => ({
      create: createComment,
      update: updateRoomPostComment,
      remove: deleteRoomPostComment,
    }),
    [createComment, deleteRoomPostComment, updateRoomPostComment],
  );
  if (!post || post.deletedAt) {
    return (
      <ScreenFrame testID="room-board-detail-screen">
        <View style={styles.emptyScreen}>
          <PageHeader onBack={returnFromPost} title="아껴씀 청년방" />
          <EmptyState
            action={
              <PrimaryButton
                label="목록으로 가기"
                onPress={returnFromPost}
                variant="secondary"
              />
            }
            icon="chat-remove-outline"
            title="삭제되었거나 없는 아낌 기록이에요."
          />
        </View>
      </ScreenFrame>
    );
  }

  const author = profiles.get(post.authorId);
  const canMutateComments = Boolean(currentUser && room?.status === "OPEN");

  return (
    <ScreenFrame
      fixedHeaderDivider
      fixedHeader={
        <PageHeader
          bottomSpacing="md"
          onBack={returnFromPost}
          right={
            canEditPost || canDeletePost ? (
              <Pressable
                accessibilityLabel="게시글 메뉴"
                accessibilityRole="button"
                hitSlop={8}
                onPress={openPostActions}
                style={styles.moreButton}
              >
                <MaterialCommunityIcons
                  color={palette.green}
                  name="dots-horizontal"
                  size={24}
                />
              </Pressable>
            ) : undefined
          }
          title="아껴씀 청년방"
        />
      }
      testID="room-board-detail-screen"
    >
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
              footer={
                <RoomPostReactionPills
                  canReact={canMutateComments}
                  currentUserId={currentUser?.id}
                  onToggle={toggleReaction}
                  reactions={reactionsByPostId.get(post.id) ?? EMPTY_REACTIONS}
                />
              }
              post={post}
              variant="detail"
            />
            {post.kind === "POLL" ? (
              <RoomPostPoll
                canVote={canMutateComments}
                currentUserId={currentUser?.id}
                onVote={(optionId) => voteRoomPostPoll(post.id, optionId)}
                options={pollOptions}
                pollClosesAt={post.pollClosesAt}
                votes={pollVotes}
              />
            ) : null}
          </>
        }
        profilesById={profiles}
        refreshControl={refreshControl}
      />
    </ScreenFrame>
  );
}

function formatFullDate(value: string): string {
  const date = new Date(value);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Seoul",
  }).format(date);

  return `${dateLabel} · ${timeLabel}`;
}

const styles = StyleSheet.create({
  emptyScreen: { flex: 1, paddingHorizontal: spacing.xl },
  moreButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
  },
});
