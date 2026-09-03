import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, palette, radii, shadow, spacing } from "@/shared/config/design";
import { useSession } from "@/shared/providers/session-provider";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PrimaryButton } from "@/shared/ui/primary-button";

export function AccountDeletionPage() {
  const router = useRouter();
  const { deleteAccount } = useSession();
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const goBack = useCallback(() => router.dismissTo("/profile"), [router]);

  const submitDeletion = useCallback(async () => {
    setMessage(null);
    setSubmitting(true);
    try {
      await deleteAccount(password);
      // SessionProvider immediately switches the auth gate to the login screen.
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "계정을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      setSubmitting(false);
    }
  }, [deleteAccount, password]);

  const confirmDeletion = useCallback(() => {
    if (!password) {
      setMessage("현재 비밀번호를 입력해 주세요.");
      return;
    }
    if (!confirmed) {
      setMessage("삭제 후 복구할 수 없다는 점을 확인해 주세요.");
      return;
    }
    setConfirmationOpen(true);
  }, [confirmed, password]);

  const cancelConfirmation = useCallback(() => setConfirmationOpen(false), []);

  const completeDeletion = useCallback(() => {
    setConfirmationOpen(false);
    void submitDeletion();
  }, [submitDeletion]);

  return (
    <ModalFormScreen
      headerBottomSpacing="md"
      loading={submitting}
      onBack={goBack}
      testID="account-deletion-screen"
      title="계정 탈퇴"
    >
      <GlassSurface style={styles.summary}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons
            color={palette.danger}
            name="account-remove-outline"
            size={30}
          />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>만족할 만큼 모으셨나요?</Text>
          <Text style={styles.summaryBody}>
            하지만 저희가 없어도 잘 해내실 거라 믿어요.
          </Text>
        </View>
      </GlassSurface>

      <NoticeBanner style={styles.warning} tone="danger">
        프로필, 사진, 개인 기록, 댓글과 게시물은 바로 영구 삭제됩니다.
      </NoticeBanner>

      <View style={styles.detailList}>
        <DetailRow
          icon="image-remove-outline"
          text="업로드한 프로필·지출·게시글 사진 모두 함께 삭제돼요."
        />
        <DetailRow
          icon="account-switch-outline"
          text="방장 권한은 다음 참여한 활성 멤버에게 넘겨져요."
        />
        <DetailRow
          icon="lock-reset"
          text="탈퇴 후에는 같은 이메일로도 기존 계정과 데이터를 복구할 수 없어요."
        />
      </View>

      <View style={styles.form}>
        <Field
          autoCapitalize="none"
          autoComplete="current-password"
          autoCorrect={false}
          label="현재 비밀번호"
          onChangeText={(value) => {
            setPassword(value);
            if (message) setMessage(null);
          }}
          returnKeyType="done"
          secureTextEntry
          textContentType="password"
          value={password}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => {
            setConfirmed((value) => !value);
            if (message) setMessage(null);
          }}
          style={styles.confirmRow}
        >
          <View style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
            {confirmed ? (
              <MaterialCommunityIcons
                color={palette.paper}
                name="check"
                size={15}
              />
            ) : null}
          </View>
          <Text style={styles.confirmText}>
            삭제된 계정과 데이터는 복구할 수 없음을 확인했습니다.
          </Text>
        </Pressable>

        <FormMessage message={message} />
        <PrimaryButton
          label="계정 영구 삭제"
          loading={submitting}
          onPress={confirmDeletion}
          variant="danger"
        />
      </View>

      <AccountDeletionConfirmationModal
        onCancel={cancelConfirmation}
        onConfirm={completeDeletion}
        visible={confirmationOpen}
      />
    </ModalFormScreen>
  );
}

function AccountDeletionConfirmationModal({
  onCancel,
  onConfirm,
  visible,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  visible: boolean;
}) {
  return (
    <Modal
      accessibilityViewIsModal
      animationType="fade"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={styles.confirmationBackdrop}>
        <Pressable
          accessible={false}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityLabel="계정을 영구 삭제할까요? 이 작업은 되돌릴 수 없어요."
          accessibilityRole="alert"
          style={styles.confirmationDialog}
        >
          <Text style={styles.confirmationTitle}>계정을 영구 삭제할까요?</Text>
          <Text style={styles.confirmationBody}>
            계정과 모든 기록들은 바로 삭제됩니다.
          </Text>
          <View style={styles.confirmationActions}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={({ pressed }) => [
                styles.confirmationButton,
                styles.cancelButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.cancelButtonLabel}>취소</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.confirmationButton,
                styles.deleteButton,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.deleteButtonLabel}>영구 삭제</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  icon,
  text,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.detailRow}>
      <MaterialCommunityIcons color={palette.muted} name={icon} size={18} />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
  },
  iconCircle: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 26,
    backgroundColor: "rgba(182,83,72,0.10)",
  },
  summaryCopy: { flex: 1, gap: spacing.xs },
  summaryTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 18,
    fontWeight: "700",
  },
  summaryBody: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    lineHeight: 18,
  },
  warning: { marginTop: spacing.lg },
  detailList: {
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: palette.rule,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  detailText: {
    flex: 1,
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    lineHeight: 18,
  },
  form: { gap: spacing.lg, marginTop: spacing.xxl },
  confirmRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  checkboxChecked: {
    borderColor: palette.danger,
    backgroundColor: palette.danger,
  },
  confirmText: {
    flex: 1,
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 12,
    lineHeight: 19,
  },
  confirmationBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(42,38,32,0.46)",
  },
  confirmationDialog: {
    width: "100%",
    maxWidth: 420,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.lg,
    backgroundColor: palette.paper,
    ...shadow,
  },
  confirmationTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 19,
    fontWeight: "700",
  },
  confirmationBody: {
    marginTop: spacing.sm,
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmationActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  confirmationButton: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  deleteButton: { backgroundColor: palette.danger },
  cancelButtonLabel: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  deleteButtonLabel: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  buttonPressed: { opacity: 0.82 },
});
