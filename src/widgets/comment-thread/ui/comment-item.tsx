import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { memo, useCallback, useMemo, useState } from "react";
import type { FocusEvent } from "react-native";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { formatCommentTime } from "../lib/format-comment-time";
import {
  useIsSelectedComment,
  type SelectedCommentStore,
} from "../model/selected-comment-store";
import type { ThreadActions, ThreadFeatures, ThreadMessage } from "../model/types";
import { validateCommentBody } from "@/shared/lib/domain/replies";
import { isRenderableMention } from "@/shared/lib/domain/comment-mentions";
import type {
  CommentReaction,
  CommentReactionEmoji,
  Profile,
} from "@/shared/api/types";
import {
  COMMENT_REACTION_EMOJIS,
  QUICK_COMMENT_REACTION_EMOJIS,
} from "@/shared/api/types";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { CommentReactionIcon } from "@/shared/ui/comment-reaction-icon";

export const CommentItem = memo(function CommentItem({
  canDelete,
  canEdit,
  canMutate,
  comment,
  currentUserId,
  editingStore,
  highlightStore,
  onBeginEdit,
  onError,
  onFeedback,
  onFocusEdit,
  onFinishEdit,
  onReply,
  profile,
  reactions,
  mentions,
  replied,
  repliedProfile,
  remove: removeComment,
  toggleReaction: toggleCommentReaction,
  update: updateComment,
  features,
}: Pick<ThreadActions, "remove" | "update" | "toggleReaction"> & {
  canDelete: boolean;
  canEdit: boolean;
  canMutate: boolean;
  comment: ThreadMessage;
  currentUserId?: string;
  /** 편집 중인 줄. 스레드가 아니라 줄이 직접 구독해 옮겨 갈 때 둘만 다시 그린다. */
  editingStore: SelectedCommentStore;
  /** 소식함에서 들어와 잠시 강조되는 줄. 구독 이유는 editingStore와 같다. */
  highlightStore: SelectedCommentStore;
  features: ThreadFeatures;
  onBeginEdit: (comment: ThreadMessage) => void;
  onError: (message: string | null) => void;
  onFeedback: (message: string | null) => void;
  onFocusEdit: (commentId: string, event: FocusEvent) => void;
  onFinishEdit: () => void;
  onReply: (comment: ThreadMessage, authorNickname: string) => void;
  profile?: Profile;
  reactions: CommentReaction[];
  mentions?: readonly import("@/shared/api/types").CommentMention[];
  replied?: ThreadMessage;
  repliedProfile?: Profile;
}) {
  const { showDialog } = useAppDialog();
  const editing = useIsSelectedComment(editingStore, comment.id) && canEdit;
  const highlighted = useIsSelectedComment(highlightStore, comment.id);
  const authorNickname = profile?.nickname ?? "알 수 없음";
  const [editingBody, setEditingBody] = useState(comment.body);
  const [reactingEmoji, setReactingEmoji] =
    useState<CommentReactionEmoji | null>(null);
  const [reactionPicker, setReactionPicker] = useState<
    "closed" | "quick" | "all"
  >("closed");
  const mine = comment.authorId === currentUserId;
  // 반응을 한 번만 훑어 이모지별 개수·내 선택 여부를 집계한다(렌더는 조회만).
  const reactionSummary = useMemo(() => {
    const summary = new Map<string, { count: number; selected: boolean }>();
    reactions.forEach((reaction) => {
      const entry = summary.get(reaction.emoji) ?? {
        count: 0,
        selected: false,
      };
      entry.count += 1;
      if (reaction.userId === currentUserId) entry.selected = true;
      summary.set(reaction.emoji, entry);
    });
    return summary;
  }, [reactions, currentUserId]);

  const copyMessage = useCallback(async () => {
    if (comment.deletedAt) return;
    await Clipboard.setStringAsync(comment.body);
    onFeedback("메시지를 복사했어요.");
  }, [comment, onFeedback]);
  const openMessageMenu = useCallback(() => {
    const buttons = [
      ...(features.replies
        ? [{ text: "답글", onPress: () => onReply(comment, authorNickname) }]
        : []),
      ...(!comment.deletedAt
        ? [{ text: "복사", onPress: () => void copyMessage() }]
        : []),
      { text: "취소", style: "cancel" as const },
    ];
    showDialog(
      "메시지 메뉴",
      features.replies
        ? "답글을 선택하면 입력창 위에 원문이 읽기 전용으로 표시돼요."
        : "댓글을 복사할 수 있어요.",
      buttons,
    );
  }, [authorNickname, comment, copyMessage, features.replies, onReply, showDialog]);
  const saveEdit = async () => {
    const validation = validateCommentBody(editingBody, features.maxLength);
    if (!validation.valid) {
      onError(
        validation.reason === "TOO_LONG"
          ? `댓글은 앞뒤 공백을 제외하고 ${features.maxLength}자까지 입력할 수 있어요.`
          : "댓글 내용을 입력해 주세요.",
      );
      return;
    }
    try {
      await updateComment(comment.id, editingBody);
      onFinishEdit();
      onError(null);
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "댓글을 수정하지 못했어요.",
      );
    }
  };
  const remove = () => {
    showDialog(
      "댓글 삭제",
      "답글 관계는 남고 본문은 삭제된 메시지로 표시돼요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () =>
            void removeComment(comment.id).catch((reason: unknown) => {
              onError(
                reason instanceof Error
                  ? reason.message
                  : "댓글을 삭제하지 못했어요.",
              );
            }),
        },
      ],
    );
  };
  const toggleReaction = async (emoji: CommentReactionEmoji) => {
    if (!canMutate || !features.reactions || comment.deletedAt || reactingEmoji || !toggleCommentReaction) return;
    setReactingEmoji(emoji);
    try {
      await toggleCommentReaction(comment.id, emoji);
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "댓글 반응을 변경하지 못했어요.",
      );
    } finally {
      setReactingEmoji(null);
    }
  };
  const toggleReactionPicker = () => {
    setReactionPicker((current) => {
      if (current === "closed") return "quick";
      if (current === "quick") return "all";
      return "closed";
    });
  };
  const chooseReaction = async (emoji: CommentReactionEmoji) => {
    await toggleReaction(emoji);
    setReactionPicker("closed");
  };

  return (
    <View
      style={[
        styles.messageRow,
        mine && styles.messageRowMine,
        highlighted && styles.messageRowHighlighted,
      ]}
    >
      {!mine ? (
        <AnimalAvatar
          photoUri={profile?.avatarUri}
          value={profile?.avatar}
          size={30}
          style={styles.messageAvatar}
        />
      ) : null}
      <View style={[styles.messageGroup, mine && styles.messageGroupMine]}>
        {!mine ? (
          <Text style={styles.messageAuthor}>
            {authorNickname}
          </Text>
        ) : null}
        <Pressable
          accessibilityHint={features.replies ? "길게 눌러 답글 또는 복사" : "길게 눌러 복사"}
          delayLongPress={320}
          onLongPress={openMessageMenu}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
            comment.deletedAt && styles.bubbleDeleted,
          ]}
        >
          {features.replies && comment.replyToId ? (
            <View style={styles.quotedMessage}>
              <Text style={[styles.quoteAuthor, mine && styles.quoteAuthorMine]}>
                {repliedProfile?.nickname ?? "삭제된 메시지"}
              </Text>
              <Text
                numberOfLines={2}
                style={[styles.quoteBody, mine && styles.quoteBodyMine]}
              >
                {replied?.deletedAt || !replied
                  ? "삭제된 메시지에 대한 답글"
                  : replied.body}
              </Text>
            </View>
          ) : null}
          {editing ? (
            <TextInput
              autoFocus
              maxLength={features.maxLength}
              multiline
              onChangeText={setEditingBody}
              onFocus={(event) => onFocusEdit(comment.id, event)}
              style={styles.editCommentInput}
              value={editingBody}
            />
          ) : (
            <CommentBody comment={comment} mentions={mentions} mine={mine} />
          )}
        </Pressable>
        {features.reactions && !comment.deletedAt ? (
          <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
            <View style={styles.reactionControls}>
              {COMMENT_REACTION_EMOJIS.filter(
                (emoji) => (reactionSummary.get(emoji)?.count ?? 0) > 0,
              ).map((emoji) => {
                const { count = 0, selected = false } =
                  reactionSummary.get(emoji) ?? {};
                return (
                  <Pressable
                    accessibilityLabel={`${emoji} 반응${count ? ` ${count}개` : ""}${selected ? ", 선택됨" : ""}`}
                    accessibilityRole="button"
                    disabled={!canMutate || !toggleCommentReaction || Boolean(reactingEmoji)}
                    key={emoji}
                    onPress={() => void toggleReaction(emoji)}
                    style={[
                      styles.reactionButton,
                      selected && styles.reactionButtonSelected,
                      (!canMutate || !toggleCommentReaction || Boolean(reactingEmoji)) &&
                        styles.reactionButtonDisabled,
                    ]}
                  >
                    <CommentReactionIcon emoji={emoji} size={20} />
                    <Text style={styles.reactionCount}>{count}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityLabel={
                  reactionPicker === "quick"
                    ? "전체 반응 보기"
                    : "반응 이모지 추가"
                }
                accessibilityRole="button"
                disabled={!canMutate || !toggleCommentReaction || Boolean(reactingEmoji)}
                onPress={toggleReactionPicker}
                style={[
                  styles.reactionAddButton,
                  (!canMutate || !toggleCommentReaction || Boolean(reactingEmoji)) &&
                    styles.reactionButtonDisabled,
                ]}
              >
                <MaterialCommunityIcons color={palette.muted} name="emoticon-plus-outline" size={19} />
              </Pressable>
            </View>
            {reactionPicker !== "closed" ? (
              <View style={[styles.reactionPicker, mine && styles.reactionPickerMine]}>
                {(reactionPicker === "quick"
                  ? QUICK_COMMENT_REACTION_EMOJIS
                  : COMMENT_REACTION_EMOJIS
                ).map((emoji) => {
                  const selected = reactionSummary.get(emoji)?.selected ?? false;
                  return (
                    <Pressable
                      accessibilityLabel={`${emoji} 반응${selected ? ", 선택됨" : ""}`}
                      accessibilityRole="button"
                      disabled={!canMutate || !toggleCommentReaction || Boolean(reactingEmoji)}
                      key={emoji}
                      onPress={() => void chooseReaction(emoji)}
                      style={[
                        styles.reactionPickerButton,
                        selected && styles.reactionButtonSelected,
                        (!canMutate || !toggleCommentReaction || Boolean(reactingEmoji)) &&
                          styles.reactionButtonDisabled,
                      ]}
                    >
                      <CommentReactionIcon emoji={emoji} size={28} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
        <View
          style={[styles.messageMetaRow, mine && styles.messageMetaRowMine]}
        >
          <Text style={styles.messageTime}>
            {formatCommentTime(comment.createdAt)}
            {comment.updatedAt !== comment.createdAt && !comment.deletedAt
              ? " · 수정됨"
              : ""}
          </Text>
          {comment.syncStatus && comment.syncStatus !== "SYNCED" ? (
            <Text style={styles.pending}>
              {comment.syncStatus === "PENDING" ? "전송 중" : "전송 실패"}
            </Text>
          ) : null}
        </View>
        {editing ? (
          <View style={[styles.commentActions, styles.commentActionsMine]}>
            <Pressable onPress={onFinishEdit}>
              <Text style={styles.commentAction}>취소</Text>
            </Pressable>
            <Pressable onPress={() => void saveEdit()}>
              <Text style={styles.commentActionStrong}>저장</Text>
            </Pressable>
          </View>
        ) : (canEdit || canDelete) && !comment.deletedAt ? (
          <View style={[styles.commentActions, styles.commentActionsMine]}>
            {canEdit ? (
              <Pressable
                onPress={() => {
                  setEditingBody(comment.body);
                  onBeginEdit(comment);
                }}
              >
                <Text style={styles.commentAction}>수정</Text>
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable onPress={remove}>
                <Text style={styles.commentActionDanger}>삭제</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
});

function CommentBody({
  comment,
  mentions: commentMentions = [],
  mine,
}: {
  comment: ThreadMessage;
  mentions?: readonly import("@/shared/api/types").CommentMention[];
  mine: boolean;
}) {
  const mentions = commentMentions
    .filter((mention) => isRenderableMention(comment.body, mention))
    .sort((left, right) => left.start - right.start);
  const points = Array.from(comment.body);
  const renderedMentions = mentions.flatMap((mention, index) => {
    const previousEnd = mentions[index - 1]?.end ?? 0;
    const before = points.slice(previousEnd, mention.start).join("");
    const tagged = points.slice(mention.start, mention.end).join("");
    return [
      before,
      <Text
        key={`${mention.commentId}:${mention.start}`}
        style={mine ? styles.mentionMine : styles.mentionOther}
      >
        {tagged}
      </Text>,
    ];
  });
  const finalCursor = mentions.at(-1)?.end ?? 0;
  return (
    <Text
      style={[
        styles.messageBody,
        mine && styles.messageBodyMine,
        comment.deletedAt && styles.deletedBody,
      ]}
    >
      {renderedMentions}
      {points.slice(finalCursor).join("")}
    </Text>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingRight: 54,
  },
  // 소식함에서 이 댓글로 들어왔을 때 잠깐 켜지는 강조. 종이 위에 형광펜을
  // 그은 느낌으로, 말풍선 색은 건드리지 않고 줄 전체를 감싼다.
  messageRowHighlighted: {
    backgroundColor: palette.paper,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.yellow,
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  messageRowMine: {
    justifyContent: "flex-end",
    paddingRight: 0,
    paddingLeft: 54,
  },
  messageAvatar: { marginTop: 18 },
  messageGroup: { alignItems: "flex-start", maxWidth: "88%" },
  messageGroupMine: { alignItems: "flex-end" },
  messageAuthor: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    marginLeft: 4,
    marginBottom: 4,
  },
  bubble: {
    minWidth: 70,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMine: { backgroundColor: palette.green, borderBottomRightRadius: 5 },
  bubbleOther: {
    backgroundColor: palette.paper,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
  },
  bubbleDeleted: { opacity: 0.68 },
  quotedMessage: {
    minWidth: 120,
    paddingLeft: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.coral,
  },
  quoteAuthor: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 9,
    fontWeight: "700",
  },
  quoteAuthorMine: { color: palette.cream },
  quoteBody: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  quoteBodyMine: { color: palette.cream },
  messageBody: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 15,
    lineHeight: 22,
  },
  messageBodyMine: { color: palette.cream },
  mentionOther: { color: palette.green, fontFamily: fonts.handBold },
  mentionMine: { color: palette.yellow, fontFamily: fonts.handBold },
  deletedBody: { fontStyle: "italic" },
  editCommentInput: {
    minWidth: 160,
    color: palette.cream,
    fontFamily: fonts.hand,
    fontSize: 15,
    lineHeight: 22,
    padding: 0,
  },
  reactionRow: {
    alignItems: "flex-start",
    marginTop: 6,
    marginLeft: 2,
  },
  reactionRowMine: {
    alignItems: "flex-end",
    marginLeft: 0,
    marginRight: 2,
  },
  reactionControls: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  reactionButton: {
    minHeight: 27,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  reactionButtonSelected: {
    borderColor: palette.coral,
    backgroundColor: "rgba(233,135,98,0.14)",
  },
  reactionButtonDisabled: { opacity: 0.62 },
  reactionCount: { color: palette.ink, fontFamily: fonts.hand, fontSize: 12 },
  reactionAddButton: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 27,
    justifyContent: "center",
    width: 31,
  },
  reactionPicker: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 2,
    padding: 6,
  },
  reactionPickerMine: { alignSelf: "flex-end" },
  reactionPickerButton: {
    alignItems: "center",
    borderRadius: radii.sm,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  messageMetaRow: { flexDirection: "row", gap: 5, marginTop: 3, marginLeft: 4 },
  messageMetaRowMine: {
    justifyContent: "flex-end",
    marginLeft: 0,
    marginRight: 4,
  },
  messageTime: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 9,
    ...tabularNums,
  },
  pending: { color: palette.coralText, fontFamily: fonts.hand, fontSize: 9 },
  commentActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 4,
    marginLeft: 4,
  },
  commentActionsMine: {
    justifyContent: "flex-end",
    marginLeft: 0,
    marginRight: 4,
  },
  commentAction: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10 },
  commentActionStrong: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 10,
    fontWeight: "700",
  },
  commentActionDanger: {
    color: palette.danger,
    fontFamily: fonts.hand,
    fontSize: 10,
  },
});
