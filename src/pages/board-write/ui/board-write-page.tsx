import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useCurrentUser } from "@/entities/member/api/use-members";
import { useActiveRoom } from "@/entities/room/api/use-rooms";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { createUuid } from "@/shared/lib/uuid";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { PrimaryButton } from "@/shared/ui/primary-button";

export function BoardWritePage() {
  const router = useRouter();
  const room = useActiveRoom();
  const currentUser = useCurrentUser();
  const { addRoomPost } = useAppActions();
  const [body, setBody] = useState("");
  const [isNotice, setIsNotice] = useState(false);
  const [isPoll, setIsPoll] = useState(false);
  const [options, setOptions] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = Boolean(
    room && currentUser && room.ownerId === currentUser.id,
  );
  const submit = async () => {
    const trimmed = body.trim();
    const normalizedOptions = options
      .map((option) => option.trim())
      .filter(Boolean);
    if (
      !room ||
      !trimmed ||
      submitting ||
      (isPoll &&
        (normalizedOptions.length < 2 ||
          new Set(normalizedOptions).size !== normalizedOptions.length))
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      await addRoomPost({
        roomId: room.id,
        kind: isNotice ? "NOTICE" : isPoll ? "POLL" : "POST",
        body: trimmed,
        options: isPoll ? normalizedOptions : undefined,
        clientRequestId: createUuid(),
      });
      router.back();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "기록을 남기지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const setOption = (index: number, value: string) => {
    setOptions((current) =>
      current.map((option, optionIndex) =>
        optionIndex === index ? value : option,
      ),
    );
  };
  const addOption = () =>
    setOptions((current) => (current.length < 4 ? [...current, ""] : current));
  const removeOption = (index: number) => {
    setOptions((current) =>
      current.length > 2
        ? current.filter((_, optionIndex) => optionIndex !== index)
        : current,
    );
  };
  const validPoll = options.map((option) => option.trim()).filter(Boolean);
  const canSubmit = Boolean(
    body.trim() &&
    !submitting &&
    (!isPoll ||
      (validPoll.length >= 2 && new Set(validPoll).size === validPoll.length)),
  );
  return (
    <ModalFormScreen
      onBack={() => router.back()}
      testID="new-room-post-screen"
      title="아낌기록 남기기"
    >
      {isOwner ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isNotice }}
          onPress={() => {
            setIsNotice((value) => !value);
            setIsPoll(false);
          }}
          style={[styles.noticeToggle, isNotice && styles.noticeToggleSelected]}
        >
          <View style={[styles.box, isNotice && styles.boxSelected]}>
            {isNotice ? <Text style={styles.check}>✓</Text> : null}
          </View>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>공지로 올리기</Text>
          </View>
        </Pressable>
      ) : null}
      {!isNotice ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isPoll }}
          onPress={() => setIsPoll((value) => !value)}
          style={[styles.noticeToggle, isPoll && styles.pollToggleSelected]}
        >
          <View style={[styles.box, isPoll && styles.pollBoxSelected]}>
            {isPoll ? <Text style={styles.check}>✓</Text> : null}
          </View>
          <View style={styles.toggleCopy}>
            <Text style={styles.toggleTitle}>투표로 만들기</Text>
            <Text style={styles.toggleHint}>
              방 멤버가 하나의 선택지를 고를 수 있어요
            </Text>
          </View>
        </Pressable>
      ) : null}
      <Field
        accessibilityLabel={isPoll ? "투표 제목" : "아낌 내용"}
        autoFocus
        maxLength={500}
        multiline
        onChangeText={setBody}
        placeholder={
          isNotice
            ? "공지 내용을 남겨주세요"
            : isPoll
              ? "투표 제목을 입력해 주세요"
              : "아낌 내용을 남겨주세요"
        }
        style={styles.field}
        textAlignVertical="top"
        value={body}
      />
      <Text style={styles.count}>{body.length}/500</Text>
      {isPoll ? (
        <View style={styles.optionsSection}>
          <Text style={styles.optionsTitle}>선택지</Text>
          {options.map((option, index) => (
            <View key={index} style={styles.optionRow}>
              <Field
                accessibilityLabel={`선택지 ${index + 1}`}
                maxLength={60}
                onChangeText={(value) => setOption(index, value)}
                placeholder={`선택지 ${index + 1}`}
                style={styles.optionField}
                value={option}
              />
              {options.length > 2 ? (
                <Pressable
                  accessibilityLabel={`선택지 ${index + 1} 삭제`}
                  accessibilityRole="button"
                  onPress={() => removeOption(index)}
                  style={styles.removeOption}
                >
                  <Text style={styles.removeOptionText}>−</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {options.length < 4 ? (
            <Pressable
              accessibilityRole="button"
              onPress={addOption}
              style={styles.addOption}
            >
              <Text style={styles.addOptionText}>+ 선택지 추가</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <FormMessage message={error} />
      <PrimaryButton
        disabled={!canSubmit}
        label={
          submitting
            ? "남기는 중…"
            : isNotice
              ? "공지 올리기"
              : isPoll
                ? "투표 올리기"
                : "아낌 기록 남기기"
        }
        onPress={() => void submit()}
        style={styles.submit}
      />
    </ModalFormScreen>
  );
}

const styles = StyleSheet.create({
  noticeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  noticeToggleSelected: {
    borderColor: palette.green,
    backgroundColor: "rgba(47,113,93,0.06)",
  },
  pollToggleSelected: {
    borderColor: palette.coral,
    backgroundColor: "rgba(233,135,98,0.08)",
  },
  box: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  boxSelected: { borderColor: palette.green, backgroundColor: palette.green },
  pollBoxSelected: {
    borderColor: palette.coral,
    backgroundColor: palette.coral,
  },
  check: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleCopy: { flex: 1 },
  toggleTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleHint: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    marginTop: 3,
  },
  optionsSection: { marginTop: spacing.lg, gap: spacing.sm },
  optionsTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  optionField: { flex: 1 },
  removeOption: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  removeOptionText: {
    color: palette.muted,
    fontFamily: fonts.handBold,
    fontSize: 21,
    lineHeight: 22,
  },
  addOption: {
    alignSelf: "flex-start",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  addOptionText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  field: { minHeight: 180, paddingTop: spacing.md },
  count: {
    alignSelf: "flex-end",
    color: palette.muted,
    fontFamily: fonts.number,
    fontSize: 11,
    marginTop: spacing.sm,
  },
  submit: { marginTop: spacing.xl },
});
