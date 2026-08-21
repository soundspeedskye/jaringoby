import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { useExpenseExceptionSummary } from "@/shared/providers/app-data-hooks";
import { FormMessage } from "@/shared/ui/form-message";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { requestNotificationPermission } from "@/shared/services/notification-service";

export function ExpenseExceptionCard({
  canApprove,
  expenseId,
}: {
  canApprove: boolean;
  expenseId: string;
}) {
  const summary = useExpenseExceptionSummary(expenseId);
  const {
    respondToExpenseException,
    withdrawExpenseException,
  } = useAppActions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback((action: () => Promise<void>, fallback: string) => {
    setError(null);
    setBusy(true);
    void (async () => {
      try {
        await action();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : fallback);
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  if (!summary) return null;
  const percent =
    summary.requiredCount > 0
      ? Math.round((summary.approvedCount / summary.requiredCount) * 100)
      : 0;

  return (
    <View style={styles.exceptionCard}>
      <View style={styles.exceptionHead}>
        <MaterialCommunityIcons
          color={palette.coralText}
          name="shield-half-full"
          size={17}
        />
        <Text style={styles.exceptionTitle}>
          예외 요청 · “{summary.reason}”
        </Text>
      </View>

      {summary.isExcluded ? (
        <View style={styles.exceptionDoneRow}>
          <MaterialCommunityIcons
            color={palette.green}
            name="check-decagram"
            size={16}
          />
          <Text style={styles.exceptionDoneText}>
            동의 완료 · 정산에서 제외돼요
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.exceptionProgressRow}>
            <View style={styles.exceptionTrack}>
              <View style={[styles.exceptionFill, { width: `${percent}%` }]} />
            </View>
            <Text style={styles.exceptionProgressText}>
              {summary.approvedCount}/{summary.requiredCount}명 동의
            </Text>
          </View>
          <Text style={styles.exceptionHintText}>
            제시자를 제외한 방 멤버 모두가 동의하면 이 지출은 예산에서 빠져요.
            {summary.heldCount ? ` 현재 ${summary.heldCount}명이 보류 중이에요.` : ""}
          </Text>
        </>
      )}

      {canApprove && !summary.isExcluded ? (
        summary.isRequester ? (
          <PrimaryButton
            label="예외 취소"
            loading={busy}
            onPress={() =>
              run(
                () => withdrawExpenseException(expenseId),
                "예외를 취소하지 못했어요.",
              )
            }
            style={styles.exceptionButton}
            variant="secondary"
          />
        ) : summary.canRespond ? (
          <View style={styles.responseButtons}>
            <PrimaryButton
              label={summary.responseByMe === "APPROVED" ? "승인됨" : "이 예외 승인하기"}
              loading={busy}
              onPress={() =>
                run(
                  () => respondToExpenseException(expenseId, "APPROVED"),
                  "예외를 승인하지 못했어요.",
                )
              }
              style={styles.responseButton}
              variant={summary.responseByMe === "APPROVED" ? "secondary" : "primary"}
            />
            <PrimaryButton
              label={summary.responseByMe === "HELD" ? "보류 중" : "보류하기"}
              loading={busy}
              onPress={() =>
                run(
                  async () => {
                    await requestNotificationPermission().catch(() => false);
                    await respondToExpenseException(expenseId, "HELD");
                  },
                  "예외를 보류하지 못했어요.",
                )
              }
              style={styles.responseButton}
              variant="secondary"
            />
          </View>
        ) : null
      ) : null}

      <FormMessage message={error} style={styles.threadError} />
    </View>
  );
}

const styles = StyleSheet.create({
  exceptionCard: {
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(168,79,61,0.35)",
    backgroundColor: "rgba(233,135,98,0.10)",
  },
  exceptionHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  exceptionTitle: {
    flex: 1,
    color: palette.coralText,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  exceptionProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  exceptionTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: palette.line,
  },
  exceptionFill: { height: "100%", backgroundColor: palette.green },
  exceptionProgressText: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    ...tabularNums,
  },
  exceptionHintText: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    lineHeight: 16,
  },
  exceptionDoneRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  exceptionDoneText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  exceptionButton: { marginTop: 4 },
  responseButtons: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  responseButton: { flex: 1 },
  threadError: {
    color: palette.danger,
    fontFamily: fonts.hand,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
