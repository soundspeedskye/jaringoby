import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { Ref } from "react";
import { useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { MentionCandidate, ThreadActions, ThreadFeatures } from "../model/types";
import { CommentComposer } from "./comment-composer";
import type { ReplyDraft } from "@/shared/lib/domain/replies";
import { createCommentCommand, normalizeCommentBody } from "@/shared/lib/domain/replies";
import {
  codePointLength,
  findActiveMention,
  remapMentions,
  replaceActiveMention,
} from "@/shared/lib/domain/comment-mentions";
import type { CommentMentionInput } from "@/shared/api/types";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { createUuid } from "@/shared/lib/uuid";
import type { PeriodPhase } from "@/shared/model/types";
import { FormMessage } from "@/shared/ui/form-message";

/**
 * 스레드가 입력 독에 말을 거는 통로. 답글 대상 선택·안내·오류는 모두 독이
 * 소유하는 상태라, 목록 쪽에서는 이 핸들로 밀어 넣기만 한다. 스레드가 이
 * 상태를 들고 있으면 오류 한 줄이 뜰 때마다 댓글 목록이 통째로 다시 그려진다.
 */
export type CommentComposerDockHandle = {
  selectReply: (replyDraft: ReplyDraft) => void;
  showFeedback: (message: string | null) => void;
  showError: (message: string | null) => void;
};

export function CommentComposerDock({
  actions,
  canMutate,
  mentionMembers,
  onFocus,
  phase,
  ref,
  features,
}: {
  actions: Pick<ThreadActions, "create">;
  canMutate: boolean;
  features: ThreadFeatures;
  mentionMembers: readonly MentionCandidate[];
  onFocus: () => void;
  phase: PeriodPhase | null;
  ref?: Ref<CommentComposerDockHandle>;
}) {
  const inputRef = useRef<TextInput>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<CommentMentionInput[]>([]);
  const [cursor, setCursor] = useState(0);
  const [sending, setSending] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(createUuid);
  useImperativeHandle(ref, () => ({
    selectReply: (draft) => {
      setReplyDraft(draft);
      setFeedback("답글 대상을 선택했어요.");
      inputRef.current?.focus();
    },
    showFeedback: setFeedback,
    showError: setError,
  }), []);
  const sendComment = useCallback(async () => {
    setError(null);
    try {
      const command = createCommentCommand(
        body,
        features.replies ? replyDraft : null,
        features.maxLength,
      );
      const normalizedBody = normalizeCommentBody(command.body);
      const leadingSpaces = codePointLength(command.body) - codePointLength(
        command.body.replace(/^ +/u, ""),
      );
      setSending(true);
      await actions.create({
        body: normalizedBody,
        mentions: mentions.map((mention) => ({
          ...mention,
          start: mention.start - leadingSpaces,
          end: mention.end - leadingSpaces,
        })),
        replyToId: command.replyToMessageId ?? undefined,
        clientRequestId,
      });
      setBody("");
      setMentions([]);
      setCursor(0);
      setReplyDraft(null);
      setFeedback(null);
      setClientRequestId(createUuid());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "댓글을 보내지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSending(false);
    }
  }, [
    actions,
    body,
    clientRequestId,
    features.maxLength,
    features.replies,
    replyDraft,
    mentions,
  ]);
  const activeMention = useMemo(
    () => findActiveMention(body, cursor),
    [body, cursor],
  );
  const mentionCandidates = useMemo(() => {
    if (!activeMention) return [];
    const query = activeMention.query.toLocaleLowerCase();
    return mentionMembers
      .filter((member) => !member.isCurrentUser)
      .filter((member) => member.nickname.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const leftPrefix = left.nickname.toLocaleLowerCase().startsWith(query);
        const rightPrefix = right.nickname.toLocaleLowerCase().startsWith(query);
        return Number(rightPrefix) - Number(leftPrefix) || left.nickname.localeCompare(right.nickname);
      })
      .slice(0, 5);
  }, [activeMention, mentionMembers]);
  const changeBody = useCallback((nextBody: string) => {
    setMentions((current) => remapMentions(body, nextBody, current));
    setBody(nextBody);
  }, [body]);
  const selectMention = useCallback((member: MentionCandidate) => {
    if (!activeMention) return;
    const next = replaceActiveMention(body, activeMention, member, mentions);
    setBody(next.body);
    setMentions(next.mentions);
    setCursor(next.cursor);
  }, [activeMention, body, mentions]);

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
            maxLength={features.maxLength}
            mentionCandidates={mentionCandidates}
            onBodyChange={changeBody}
            onFocus={onFocus}
            onMentionSelect={selectMention}
            onReplyChange={setReplyDraft}
            onSelectionChange={setCursor}
            onSend={sendComment}
            placeholder={features.placeholder}
            replyDraft={replyDraft}
            selection={cursor}
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
