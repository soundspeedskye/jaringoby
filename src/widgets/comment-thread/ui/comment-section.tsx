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
  // 독 높이가 0에서 실제값으로 처음 뛸 때, 스크롤 컴포넌트는 그 증가분을
  // "키보드가 올라왔다"와 똑같이 보고 목록을 그만큼 밀어 내린다. 그래서 화면에
  // 들어오자마자 글 상단이 독 높이만큼 잘린 채로 시작한다.
  //
  // 그래서 입력에 처음 포커스가 갈 때까지 스크롤 보정을 얼려 둔다.
  // 얼음을 프레임 타이밍으로 풀면 안 된다. shared value가 UI 스레드에 닿는
  // 시점이 프레임 경계와 어긋나 먼저 녹아버릴 수 있다(실제로 그랬다).
  // 포커스는 키보드가 뜨기 전에 확실히 앞서고, 독 높이가 변하는 경우(멀티라인·
  // 답글 칩·에러 문구)도 전부 포커스 이후라 이 시점에 풀면 잃는 보정이 없다.
  // 여백(contentInset) 확장은 freeze와 무관하게 적용되어 아래 공간은 계속 확보된다.
  const [chatScrollFrozen, setChatScrollFrozen] = useState(true);
  const unfreezeChatScroll = useCallback(() => setChatScrollFrozen(false), []);
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
      unfreezeChatScroll();
      scrollInputAboveKeyboard(event);
    },
    [comments, scrollInputAboveKeyboard, unfreezeChatScroll],
  );
  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    setComposerHeight(event.nativeEvent.layout.height);
  }, []);
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <CommentChatScrollView
        {...props}
        extraContentPadding={composerContentPadding}
        freeze={chatScrollFrozen}
      />
    ),
    [chatScrollFrozen, composerContentPadding],
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
            onFocus={unfreezeChatScroll}
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
