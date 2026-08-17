import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { CommentActionProps } from "../model/types";
import { CommentComposer } from "./comment-composer";
import type { ReplyDraft } from "@/shared/lib/domain/replies";
import { createCommentCommand } from "@/shared/lib/domain/replies";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { createUuid } from "@/shared/lib/uuid";
import type { PeriodPhase } from "@/shared/model/types";
import { FormMessage } from "@/shared/ui/form-message";

export function CommentComposerDock({
  addComment,
  canMutate,
  error,
  expenseId,
  feedback,
  inputRef,
  onError,
  onFeedback,
  onReplyChange,
  phase,
  replyDraft,
}: Pick<CommentActionProps, "addComment"> & {
  canMutate: boolean;
  error: string | null;
  expenseId: string;
  feedback: string | null;
  inputRef: React.RefObject<TextInput | null>;
  onError: (message: string | null) => void;
  onFeedback: (message: string | null) => void;
  onReplyChange: (replyDraft: ReplyDraft | null) => void;
  phase: PeriodPhase | null;
  replyDraft: ReplyDraft | null;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(createUuid);
  const sendComment = useCallback(async () => {
    onError(null);
    try {
      const command = createCommentCommand(body, replyDraft);
      setSending(true);
      await addComment({
        expenseId,
        body: command.body,
        replyToId: command.replyToMessageId ?? undefined,
        clientRequestId,
      });
      setBody("");
      onReplyChange(null);
      onFeedback(null);
      setClientRequestId(createUuid());
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "댓글을 보내지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSending(false);
    }
  }, [
    addComment,
    body,
    clientRequestId,
    expenseId,
    onError,
    onFeedback,
    onReplyChange,
    replyDraft,
  ]);

  return (
    <SafeAreaView edges={["bottom"]} style={styles.composerSafeArea}>
      <View style={styles.composerDock}>
        <FormMessage
          message={feedback}
          style={styles.feedback}
          tone="success"
        />
        <FormMessage message={error} style={styles.threadError} />

        {canMutate ? (
          <CommentComposer
            body={body}
            inputRef={inputRef}
            onBodyChange={setBody}
            onReplyChange={onReplyChange}
            onSend={sendComment}
            replyDraft={replyDraft}
            sending={sending}
          />
        ) : (
          <View style={styles.closedComposer}>
            <MaterialCommunityIcons
              color={palette.muted}
              name="lock-outline"
              size={17}
            />
            <Text style={styles.closedComposerText}>
              {phase === "WAITING"
                ? "챌린지가 시작되면 댓글을 남길 수 있어요."
                : "완료된 대화는 읽기 전용으로 보관돼요."}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  composerSafeArea: { backgroundColor: palette.cream },
  composerDock: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.line,
    backgroundColor: palette.cream,
  },
  feedback: {
    color: palette.success,
    fontFamily: fonts.hand,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
  threadError: {
    color: palette.danger,
    fontFamily: fonts.hand,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
  closedComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(52,49,40,0.06)",
  },
  closedComposerText: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
  },
});
