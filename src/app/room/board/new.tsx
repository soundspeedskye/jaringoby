import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ModalFormScreen } from "@/components/layout/modal-form-screen";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { PrimaryButton } from "@/components/ui/primary-button";
import { fonts, palette, radii, spacing } from "@/constants/design";
import { useAppActions } from "@/providers/app-actions-provider";
import { useActiveRoom, useCurrentUser } from "@/providers/app-data-hooks";
import { createUuid } from "@/utils/uuid";

export default function NewRoomPostScreen() {
  const router = useRouter();
  const room = useActiveRoom();
  const currentUser = useCurrentUser();
  const { addRoomPost } = useAppActions();
  const [body, setBody] = useState("");
  const [isNotice, setIsNotice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOwner = Boolean(
    room && currentUser && room.ownerId === currentUser.id,
  );
  const submit = async () => {
    const trimmed = body.trim();
    if (!room || !trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await addRoomPost({
        roomId: room.id,
        kind: isNotice ? "NOTICE" : "POST",
        body: trimmed,
        clientRequestId: createUuid(),
      });
      router.back();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "냥톡을 남기지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <ModalFormScreen
      onBack={() => router.back()}
      testID="new-room-post-screen"
      title="냥톡 남기기"
    >
      {isOwner ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isNotice }}
          onPress={() => setIsNotice((value) => !value)}
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
      <Field
        accessibilityLabel="냥톡 내용"
        autoFocus
        maxLength={500}
        multiline
        onChangeText={setBody}
        placeholder={
          isNotice ? "공지 내용을 남겨주세요" : "냥톡 내용을 남겨주세요"
        }
        style={styles.field}
        textAlignVertical="top"
        value={body}
      />
      <Text style={styles.count}>{body.length}/500</Text>
      <FormMessage message={error} />
      <PrimaryButton
        disabled={!body.trim() || submitting}
        label={
          submitting ? "남기는 중…" : isNotice ? "공지 올리기" : "냥톡 남기기"
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
