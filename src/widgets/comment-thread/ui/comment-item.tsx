import * as Clipboard from "expo-clipboard";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { formatCommentTime } from "../lib/format-comment-time";
import type { CommentActionProps } from "../model/types";
import { COMMENT_MAX_CHARACTERS, validateCommentBody } from "@/shared/lib/domain/replies";
import type {
  Comment,
  CommentReaction,
  CommentReactionEmoji,
  Profile,
} from "@/shared/api/types";
import { COMMENT_REACTION_EMOJIS } from "@/shared/api/types";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";

export const CommentItem = memo(function CommentItem({
  canEdit,
  canMutate,
  comment,
  currentUserId,
  deleteComment,
  editing,
  onBeginEdit,
  onError,
  onFeedback,
  onFinishEdit,
  onReply,
  profile,
  reactions,
  replied,
  repliedProfile,
  toggleCommentReaction,
  updateComment,
}: Omit<CommentActionProps, "addComment"> & {
  canEdit: boolean;
  canMutate: boolean;
  comment: Comment;
  currentUserId?: string;
  editing: boolean;
  onBeginEdit: (comment: Comment) => void;
  onError: (message: string | null) => void;
  onFeedback: (message: string | null) => void;
  onFinishEdit: () => void;
  onReply: (comment: Comment) => void;
  profile?: Profile;
  reactions: CommentReaction[];
  replied?: Comment;
  repliedProfile?: Profile;
  toggleCommentReaction: (
    commentId: string,
    emoji: CommentReactionEmoji,
  ) => Promise<void>;
}) {
  const { showDialog } = useAppDialog();
  const [editingBody, setEditingBody] = useState(comment.body);
  const [reactingEmoji, setReactingEmoji] =
    useState<CommentReactionEmoji | null>(null);
  const mine = comment.userId === currentUserId;
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
      { text: "답글", onPress: () => onReply(comment) },
      ...(!comment.deletedAt
        ? [{ text: "복사", onPress: () => void copyMessage() }]
        : []),
      { text: "취소", style: "cancel" as const },
    ];
    showDialog(
      "메시지 메뉴",
      "답글을 선택하면 입력창 위에 원문이 읽기 전용으로 표시돼요.",
      buttons,
    );
  }, [comment, copyMessage, onReply, showDialog]);
  const saveEdit = async () => {
    const validation = validateCommentBody(editingBody);
    if (!validation.valid) {
      onError(
        validation.reason === "TOO_LONG"
          ? `댓글은 앞뒤 공백을 제외하고 ${COMMENT_MAX_CHARACTERS}자까지 입력할 수 있어요.`
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
            void deleteComment(comment.id).catch((reason: unknown) => {
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
    if (!canMutate || comment.deletedAt || reactingEmoji) return;
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

  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
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
            {profile?.nickname ?? "알 수 없음"}
          </Text>
        ) : null}
        <Pressable
          accessibilityHint="길게 눌러 답글 또는 복사"
          delayLongPress={320}
          onLongPress={openMessageMenu}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
            comment.deletedAt && styles.bubbleDeleted,
          ]}
        >
          {comment.replyToId ? (
            <View style={styles.quotedMessage}>
              <Text style={styles.quoteAuthor}>
                {repliedProfile?.nickname ?? "삭제된 메시지"}
              </Text>
              <Text numberOfLines={2} style={styles.quoteBody}>
                {replied?.deletedAt || !replied
                  ? "삭제된 메시지에 대한 답글"
                  : replied.body}
              </Text>
            </View>
          ) : null}
          {editing ? (
            <TextInput
              autoFocus
              maxLength={COMMENT_MAX_CHARACTERS}
              multiline
              onChangeText={setEditingBody}
              style={styles.editCommentInput}
              value={editingBody}
            />
          ) : (
            <Text
              style={[
                styles.messageBody,
                mine && styles.messageBodyMine,
                comment.deletedAt && styles.deletedBody,
              ]}
            >
              {comment.body}
            </Text>
          )}
        </Pressable>
        {!comment.deletedAt ? (
          <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
            {COMMENT_REACTION_EMOJIS.map((emoji) => {
              const { count = 0, selected = false } =
                reactionSummary.get(emoji) ?? {};
              return (
                <Pressable
                  accessibilityLabel={`${emoji} 반응${count ? ` ${count}개` : ""}${selected ? ", 선택됨" : ""}`}
                  accessibilityRole="button"
                  disabled={!canMutate || Boolean(reactingEmoji)}
                  key={emoji}
                  onPress={() => void toggleReaction(emoji)}
                  style={[
                    styles.reactionButton,
                    selected && styles.reactionButtonSelected,
                    (!canMutate || Boolean(reactingEmoji)) &&
                      styles.reactionButtonDisabled,
                  ]}
                >
                  <Text style={styles.reactionText}>
                    {emoji}
                    {count ? ` ${count}` : ""}
                  </Text>
                </Pressable>
              );
            })}
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
          {comment.syncStatus !== "SYNCED" ? (
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
        ) : mine && canMutate && !comment.deletedAt ? (
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
            <Pressable onPress={remove}>
              <Text style={styles.commentActionDanger}>삭제</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingRight: 54,
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
    color: "#FFF7E3",
    fontFamily: fonts.handBold,
    fontSize: 9,
    fontWeight: "700",
  },
  quoteBody: {
    color: "#FFF7E3",
    fontFamily: fonts.hand,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  messageBody: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 15,
    lineHeight: 22,
  },
  messageBodyMine: { color: palette.cream },
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
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
    marginLeft: 2,
  },
  reactionRowMine: {
    justifyContent: "flex-end",
    marginLeft: 0,
    marginRight: 2,
  },
  reactionButton: {
    minHeight: 27,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
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
  reactionText: { color: palette.ink, fontFamily: fonts.hand, fontSize: 12 },
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
