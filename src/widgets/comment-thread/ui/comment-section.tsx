import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ThreadActions, ThreadFeatures, ThreadMessage } from "../model/types";
import type { ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  FocusEvent,
  LayoutChangeEvent,
  ListRenderItemInfo,
  ScrollViewProps,
} from "react-native";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useDerivedValue } from "react-native-reanimated";

import { CommentChatScrollView } from "./comment-chat-scroll-view";
import { CommentComposerDock } from "./comment-composer-dock";
import { CommentItem } from "./comment-item";
import { InputFocusContext } from "@/shared/lib/input-focus-context";
import type { ReplyDraft } from "@/shared/lib/domain/replies";
import { prepareReplyDraft } from "@/shared/lib/domain/replies";
import type {
  CommentReaction,
  Profile,
} from "@/shared/api/types";
import { fonts, palette, spacing } from "@/shared/config/design";
import type { PeriodPhase } from "@/shared/model/types";
import { EmptyState } from "@/shared/ui/empty-state";

const EMPTY_COMMENT_REACTIONS: CommentReaction[] = [];

export function CommentThread({
  actions,
  canMutate,
  canDelete,
  canEdit,
  comments,
  currentUserId,
  features,
  header,
  phase,
  profilesById,
  reactionsByCommentId,
}: {
  actions: ThreadActions;
  canMutate: boolean;
  canDelete: (comment: ThreadMessage) => boolean;
  canEdit: (comment: ThreadMessage) => boolean;
  comments: ThreadMessage[];
  currentUserId?: string;
  features: ThreadFeatures;
  header: ReactNode;
  phase?: PeriodPhase | null;
  profilesById: ReadonlyMap<string, Profile>;
  reactionsByCommentId?: ReadonlyMap<string, CommentReaction[]>;
}) {
  const listRef = useRef<FlatList<ThreadMessage>>(null);
  const composerRef = useRef<TextInput>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  // 입력 독 높이만큼 목록 아래 여백을 준다. 워크릿에서 읽히므로 shared value다.
  const composerContentPadding = useDerivedValue(
    () => composerHeight,
    [composerHeight],
  );
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
  const scrollInputAboveKeyboard = useCallback(
    (event: FocusEvent) => {
      const responder = listRef.current?.getScrollResponder() as
        | ScrollView
        | null
        | undefined;
      responder?.scrollResponderScrollNativeHandleToKeyboard(
        event.target,
        composerHeight + spacing.lg,
        true,
      );
    },
    [composerHeight],
  );
  const focusCommentEditor = useCallback(
    (commentId: string, event: FocusEvent) => {
      const index = comments.findIndex((comment) => comment.id === commentId);
      if (index >= 0) {
        listRef.current?.scrollToIndex({
          animated: true,
          index,
          viewPosition: 0.5,
        });
      }
      scrollInputAboveKeyboard(event);
    },
    [comments, scrollInputAboveKeyboard],
  );
  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    setComposerHeight(event.nativeEvent.layout.height);
  }, []);
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <CommentChatScrollView
        {...props}
        extraContentPadding={composerContentPadding}
      />
    ),
    [composerContentPadding],
  );
  const selectReply = useCallback(
    (comment: ThreadMessage) => {
      const profile = profilesById.get(comment.authorId);
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
  const beginEdit = useCallback((comment: ThreadMessage) => {
    setEditingCommentId(comment.id);
  }, []);
  const finishEdit = useCallback(() => {
    setEditingCommentId(null);
  }, []);
  const renderComment = useCallback(
    ({ item: comment }: ListRenderItemInfo<ThreadMessage>) => {
      const replied = comment.replyToId
        ? commentsById.get(comment.replyToId)
        : undefined;
      const editable = canMutate && canEdit(comment) && !comment.deletedAt;
      const deletable = canMutate && canDelete(comment) && !comment.deletedAt;
      return (
        <CommentItem
          canDelete={deletable}
          canEdit={editable}
          canMutate={canMutate}
          comment={comment}
          currentUserId={currentUserId}
          editing={editingCommentId === comment.id && editable}
          features={features}
          onBeginEdit={beginEdit}
          onError={setError}
          onFeedback={setFeedback}
          onFocusEdit={focusCommentEditor}
          onFinishEdit={finishEdit}
          onReply={selectReply}
          profile={profilesById.get(comment.authorId)}
          reactions={
            reactionsByCommentId?.get(comment.id) ?? EMPTY_COMMENT_REACTIONS
          }
          replied={replied}
          repliedProfile={
            replied ? profilesById.get(replied.authorId) : undefined
          }
          remove={actions.remove}
          toggleReaction={actions.toggleReaction}
          update={actions.update}
        />
      );
    },
    [
      beginEdit,
      actions.remove,
      actions.toggleReaction,
      actions.update,
      canDelete,
      canEdit,
      canMutate,
      commentsById,
      currentUserId,
      editingCommentId,
      features,
      finishEdit,
      focusCommentEditor,
      profilesById,
      reactionsByCommentId,
      selectReply,
    ],
  );

  return (
    <InputFocusContext.Provider value={scrollInputAboveKeyboard}>
      <View style={styles.commentScreen}>
        <FlatList
          accessibilityLabel="댓글 대화"
          contentContainerStyle={styles.commentListContent}
          data={comments}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
          renderScrollComponent={renderScrollComponent}
          ref={listRef}
          showsVerticalScrollIndicator={false}
          style={styles.commentList}
        />

        <KeyboardStickyView
          onLayout={handleComposerLayout}
          style={styles.composerSticky}
        >
          <CommentComposerDock
            actions={actions}
            canMutate={canMutate}
            error={error}
            feedback={feedback}
            features={features}
            inputRef={composerRef}
            onError={setError}
            onFeedback={setFeedback}
            onReplyChange={setReplyDraft}
            phase={phase ?? null}
            replyDraft={replyDraft}
          />
        </KeyboardStickyView>
      </View>
    </InputFocusContext.Provider>
  );
}

function CommentSeparator() {
  return <View style={styles.commentSeparator} />;
}

const styles = StyleSheet.create({
  commentScreen: { flex: 1 },
  commentList: { flex: 1 },
  composerSticky: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
  },
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
