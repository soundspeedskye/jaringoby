import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { CommentActionProps } from "../model/types";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ListRenderItemInfo } from "react-native";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CommentComposerDock } from "./comment-composer-dock";
import { CommentItem } from "./comment-item";
import type { ReplyDraft } from "@/entities/post";
import { prepareReplyDraft } from "@/entities/post";
import type {
  Comment,
  CommentReaction,
  CommentReactionEmoji,
  Profile,
} from "@/shared/api/types";
import { fonts, palette, spacing } from "@/shared/config/design";
import type { PeriodPhase } from "@/shared/model/types";
import { EmptyState } from "@/shared/ui/empty-state";

const EMPTY_COMMENT_REACTIONS: CommentReaction[] = [];

export function CommentSection({
  addComment,
  canMutate,
  comments,
  currentUserId,
  deleteComment,
  expenseId,
  header,
  phase,
  profilesById,
  reactionsByCommentId,
  toggleCommentReaction,
  updateComment,
}: CommentActionProps & {
  canMutate: boolean;
  comments: Comment[];
  currentUserId?: string;
  reactionsByCommentId: ReadonlyMap<string, CommentReaction[]>;
  expenseId: string;
  header: ReactNode;
  phase: PeriodPhase | null;
  profilesById: ReadonlyMap<string, Profile>;
  toggleCommentReaction: (
    commentId: string,
    emoji: CommentReactionEmoji,
  ) => Promise<void>;
}) {
  const composerRef = useRef<TextInput>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const commentsById = useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );
  const commentCount = useMemo(
    () => comments.filter((comment) => !comment.deletedAt).length,
    [comments],
  );
  const selectReply = useCallback(
    (comment: Comment) => {
      const profile = profilesById.get(comment.userId);
      setReplyDraft(
        prepareReplyDraft({
          messageId: comment.id,
          authorNickname: profile?.nickname ?? "알 수 없음",
          body: comment.body,
          deleted: Boolean(comment.deletedAt),
          replyToMessageId: comment.replyToId,
        }),
      );
      setFeedback("답글 대상을 선택했어요.");
      composerRef.current?.focus();
    },
    [profilesById],
  );
  const beginEdit = useCallback((comment: Comment) => {
    setEditingCommentId(comment.id);
  }, []);
  const finishEdit = useCallback(() => {
    setEditingCommentId(null);
  }, []);
  const renderComment = useCallback(
    ({ item: comment }: ListRenderItemInfo<Comment>) => {
      const replied = comment.replyToId
        ? commentsById.get(comment.replyToId)
        : undefined;
      const canEdit = comment.userId === currentUserId && !comment.deletedAt;
      return (
        <CommentItem
          canEdit={canEdit}
          canMutate={canMutate}
          comment={comment}
          currentUserId={currentUserId}
          deleteComment={deleteComment}
          editing={editingCommentId === comment.id && canMutate && canEdit}
          onBeginEdit={beginEdit}
          onError={setError}
          onFeedback={setFeedback}
          onFinishEdit={finishEdit}
          onReply={selectReply}
          profile={profilesById.get(comment.userId)}
          reactions={
            reactionsByCommentId.get(comment.id) ?? EMPTY_COMMENT_REACTIONS
          }
          replied={replied}
          repliedProfile={
            replied ? profilesById.get(replied.userId) : undefined
          }
          toggleCommentReaction={toggleCommentReaction}
          updateComment={updateComment}
        />
      );
    },
    [
      beginEdit,
      canMutate,
      commentsById,
      currentUserId,
      deleteComment,
      editingCommentId,
      finishEdit,
      profilesById,
      reactionsByCommentId,
      selectReply,
      toggleCommentReaction,
      updateComment,
    ],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.commentScreen}
    >
      <FlatList
        accessibilityLabel="지출 댓글 대화"
        contentContainerStyle={styles.commentListContent}
        data={comments}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(comment) => comment.id}
        ListEmptyComponent={
          <EmptyState
            title="아직 댓글이 없어요. 첫 응원을 남겨 보세요."
            variant="compact"
          />
        }
        ListHeaderComponent={
          <>
            {header}
            <View style={styles.threadHeader}>
              <View>
                <Text style={styles.threadTitle}>댓글 {commentCount}</Text>
              </View>
              <MaterialCommunityIcons
                color={palette.greenSoft}
                name="message-text-outline"
                size={23}
              />
            </View>
          </>
        }
        ItemSeparatorComponent={CommentSeparator}
        renderItem={renderComment}
        showsVerticalScrollIndicator={false}
      />

      <CommentComposerDock
        addComment={addComment}
        canMutate={canMutate}
        error={error}
        expenseId={expenseId}
        feedback={feedback}
        inputRef={composerRef}
        onError={setError}
        onFeedback={setFeedback}
        onReplyChange={setReplyDraft}
        phase={phase}
        replyDraft={replyDraft}
      />
    </KeyboardAvoidingView>
  );
}

function CommentSeparator() {
  return <View style={styles.commentSeparator} />;
}

const styles = StyleSheet.create({
  commentScreen: { flex: 1 },
  commentListContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xxxl,
    marginBottom: spacing.lg,
  },
  threadTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 20,
    fontWeight: "800",
  },
  commentSeparator: { height: spacing.md },
});
