import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimalAvatar } from "@/components/avatar/animal-avatar";
import { fonts, palette, radii, spacing, tabularNums } from "@/constants/design";
import { useAppActions } from "@/providers/app-actions-provider";
import { usePendingExceptionApprovals } from "@/providers/app-data-hooks";
import { useAppDialog } from "@/providers/app-dialog-provider";
import { formatWon } from "@/utils/format";

/** 홈 상단 "예외 승인 대기함"(안 B): 내가 승인해야 할 예외를 모아 보여준다. */
export function ExceptionApprovalInbox() {
  const pending = usePendingExceptionApprovals();
  const { approveExpenseException } = useAppActions();
  const { showDialog } = useAppDialog();
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (pending.length === 0) return null;

  const approve = (expenseId: string) => {
    setBusyId(expenseId);
    void (async () => {
      try {
        await approveExpenseException(expenseId);
      } catch (reason) {
        showDialog(
          "예외를 승인하지 못했어요",
          reason instanceof Error
            ? reason.message
            : "잠시 후 다시 시도해 주세요.",
        );
      } finally {
        setBusyId(null);
      }
    })();
  };

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((value) => !value)}
        style={styles.header}
      >
        <MaterialCommunityIcons
          color={palette.coralText}
          name="alert-outline"
          size={18}
        />
        <Text style={styles.headerText}>
          예외 승인 대기 {pending.length}건
        </Text>
        <MaterialCommunityIcons
          color={palette.coralText}
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.list}>
          {pending.map((item) => (
            <View key={item.expenseId} style={styles.row}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/expense/${item.expenseId}`)}
                style={styles.rowMain}
              >
                <AnimalAvatar photoUri={item.requesterAvatarUri} size={34} value={item.requesterAvatar} />
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {item.requesterNickname} · {item.category}{" "}
                    {formatWon(item.amount)}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    사유 “{item.reason}” · {item.approvedCount}/
                    {item.requiredCount} 승인
                  </Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busyId === item.expenseId}
                onPress={() => approve(item.expenseId)}
                style={[
                  styles.approveButton,
                  busyId === item.expenseId && styles.approveButtonBusy,
                ]}
              >
                <Text style={styles.approveButtonText}>승인</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(168,79,61,0.35)",
    backgroundColor: "rgba(233,135,98,0.10)",
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerText: {
    flex: 1,
    color: palette.coralText,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  list: { marginTop: spacing.md, gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  rowMeta: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    marginTop: 2,
    ...tabularNums,
  },
  approveButton: {
    minHeight: 34,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.green,
    backgroundColor: palette.paper,
  },
  approveButtonBusy: { opacity: 0.5 },
  approveButtonText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
});
