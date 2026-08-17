import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { ReplyDraft } from "@/entities/post";
import { COMMENT_MAX_CHARACTERS, validateCommentBody } from "@/entities/post";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { GlassSurface } from "@/shared/ui/glass-surface";

export const CommentComposer = memo(function CommentComposer({
  body,
  inputRef,
  onBodyChange,
  onReplyChange,
  onSend,
  replyDraft,
  sending,
}: {
  body: string;
  inputRef: React.RefObject<TextInput | null>;
  onBodyChange: (body: string) => void;
  onReplyChange: (replyDraft: ReplyDraft | null) => void;
  onSend: () => Promise<void>;
  replyDraft: ReplyDraft | null;
  sending: boolean;
}) {
  const bodyValid = validateCommentBody(body).valid;

  return (
    <GlassSurface interactive style={styles.composer} testID="comment-composer">
      {replyDraft ? (
        <View style={styles.replyChip}>
          <MaterialCommunityIcons
            color={palette.coral}
            name="reply"
            size={18}
          />
          <View style={styles.replyCopy}>
            <Text style={styles.replyAuthor}>
              {replyDraft.quote.authorNickname}에게 답글
            </Text>
            <Text numberOfLines={1} style={styles.replyPreview}>
              {replyDraft.quote.preview}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="답글 취소"
            onPress={() => onReplyChange(null)}
          >
            <MaterialCommunityIcons
              color={palette.muted}
              name="close-circle"
              size={20}
            />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composerRow}>
        <TextInput
          accessibilityLabel="댓글 입력"
          maxLength={COMMENT_MAX_CHARACTERS}
          multiline
          onChangeText={onBodyChange}
          placeholder="응원이나 피드백을 남겨요"
          placeholderTextColor={palette.muted}
          ref={inputRef}
          style={styles.composerInput}
          value={body}
        />
        <Pressable
          accessibilityLabel="댓글 보내기"
          disabled={sending || !bodyValid}
          onPress={() => void onSend()}
          style={[
            styles.sendButton,
            (sending || !bodyValid) && styles.sendButtonDisabled,
          ]}
        >
          <MaterialCommunityIcons
            color={palette.cream}
            name={sending ? "dots-horizontal" : "send"}
            size={19}
          />
        </Pressable>
      </View>
    </GlassSurface>
  );
});

const styles = StyleSheet.create({
  composer: {
    padding: spacing.md,
    backgroundColor: palette.paper,
  },
  replyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: "rgba(233,135,98,0.10)",
  },
  replyCopy: { flex: 1 },
  replyAuthor: {
    color: palette.coralText,
    fontFamily: fonts.handBold,
    fontSize: 10,
    fontWeight: "700",
  },
  replyPreview: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    marginTop: 2,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 15,
    lineHeight: 22,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    backgroundColor: palette.paper,
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: palette.green,
  },
  sendButtonDisabled: { opacity: 0.36 },
});
