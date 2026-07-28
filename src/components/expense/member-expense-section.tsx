import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExpenseCard } from "@/components/expense/expense-card";
import type { MemberListItem } from "@/components/room/member-list";
import { EmptyState } from "@/components/ui/empty-state";
import { palette, radii, spacing } from "@/constants/design";
import {
  expenseOfficialAmount,
  expensePendingDelta,
  hasPendingExpenseProjection,
} from "@/data/expense-sync";
import type { Expense } from "@/data/types";
import { formatDateLabel, formatWon } from "@/utils/format";

type MemberExpenseSectionHeaderProps = {
  expanded: boolean;
  expenses: Expense[];
  member: MemberListItem;
  onToggle: (memberId: string) => void;
};

export const MemberExpenseSectionHeader = memo(
  function MemberExpenseSectionHeader({
    expanded,
    expenses,
    member,
    onToggle,
  }: MemberExpenseSectionHeaderProps) {
    const total = expenses.reduce(
      (sum, expense) => sum + expenseOfficialAmount(expense),
      0,
    );
    const pendingDelta = expenses.reduce(
      (sum, expense) => sum + expensePendingDelta(expense),
      0,
    );
    const hasPending = expenses.some(hasPendingExpenseProjection);
    const pendingSummary =
      pendingDelta === 0
        ? "금액 외 변경"
        : `대기 반영 ${formatSignedWon(pendingDelta)}`;
    const displayName = member.isCurrentUser ? "나" : member.nickname;

    return (
      <Pressable
        accessibilityHint={`누르면 ${displayName}님의 지출 목록을 ${expanded ? "접습니다" : "펼칩니다"}`}
        accessibilityLabel={`${member.isCrowned ? "현재 1위, " : ""}${displayName}, 지출 ${expenses.length}건, 공식 합계 ${formatWon(total)}${hasPending ? `, ${pendingSummary}` : ""}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => onToggle(member.id)}
        style={({ pressed }) => [
          styles.header,
          expanded && styles.headerExpanded,
          pressed && styles.headerPressed,
        ]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{member.avatar}</Text>
        </View>

        <View style={styles.memberCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {member.isCrowned ? "👑 " : ""}
              {displayName}
            </Text>
            {member.isLateJoiner ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>중도 합류</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.summary}>
            {expenses.length
              ? `${expenses.length}건 · 공식 ${formatWon(total)}${hasPending ? ` · ${pendingSummary}` : ""}`
              : "아직 지출 없음"}
          </Text>
        </View>

        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <MaterialCommunityIcons
            color={expanded ? palette.cream : palette.green}
            name={expanded ? "chevron-up" : "chevron-down"}
            size={22}
          />
        </View>
      </Pressable>
    );
  },
  areHeaderPropsEqual,
);

export const MemberExpenseRow = memo(function MemberExpenseRow({
  avatar,
  commentCount,
  displayName,
  expense,
  isCrowned,
  onPress,
}: {
  avatar: string;
  commentCount: number;
  displayName: string;
  expense: Expense;
  isCrowned: boolean;
  onPress: (expenseId: string) => void;
}) {
  return (
    <View style={styles.expenseRow}>
      <ExpenseCard
        amount={expense.amount}
        avatar={avatar}
        category={expense.category}
        commentCount={commentCount}
        edited={expense.createdAt !== expense.updatedAt}
        hideAuthor
        id={expense.id}
        memo={expense.memo}
        nickname={`${isCrowned ? "👑 " : ""}${displayName}`}
        occurredAtLabel={formatDateLabel(expense.occurredAt)}
        onPress={onPress}
        photoUri={expense.photoUri ?? ""}
      />
    </View>
  );
});

export function MemberExpenseSectionFooter({
  expanded,
  member,
  hasExpenses,
}: {
  expanded: boolean;
  member: MemberListItem;
  hasExpenses: boolean;
}) {
  if (!expanded) return <View style={styles.sectionGap} />;
  if (hasExpenses) {
    return (
      <>
        <View style={[styles.expenseBody, styles.expenseBodyEnd]} />
        <View style={styles.sectionGap} />
      </>
    );
  }
  const displayName = member.isCurrentUser ? "나" : member.nickname;
  return (
    <>
      <View style={styles.emptyBody}>
        <EmptyState
          icon="camera-outline"
          title={`${displayName}님의 지출 기록이 아직 없어요.`}
          variant="compact"
        />
      </View>
      <View style={styles.sectionGap} />
    </>
  );
}

function formatSignedWon(value: number): string {
  return `${value > 0 ? "+" : "-"}${formatWon(Math.abs(value))}`;
}

function areHeaderPropsEqual(
  previous: MemberExpenseSectionHeaderProps,
  next: MemberExpenseSectionHeaderProps,
): boolean {
  const previousMember = previous.member;
  const nextMember = next.member;
  return (
    previous.expanded === next.expanded &&
    previous.expenses === next.expenses &&
    previous.onToggle === next.onToggle &&
    previousMember.id === nextMember.id &&
    previousMember.nickname === nextMember.nickname &&
    previousMember.avatar === nextMember.avatar &&
    previousMember.detail === nextMember.detail &&
    previousMember.remaining === nextMember.remaining &&
    previousMember.isCrowned === nextMember.isCrowned &&
    previousMember.isLateJoiner === nextMember.isLateJoiner &&
    previousMember.isCurrentUser === nextMember.isCurrentUser
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(52,49,40,0.10)",
    borderRadius: radii.md,
    backgroundColor: "rgba(255,253,247,0.56)",
  },
  headerExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderColor: "rgba(47,113,93,0.24)",
    backgroundColor: "rgba(255,253,247,0.82)",
  },
  headerPressed: { backgroundColor: "rgba(47,113,93,0.06)" },
  avatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "rgba(255,255,255,0.68)",
  },
  avatarText: { fontSize: 21 },
  memberCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    flexShrink: 1,
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(233,135,98,0.11)",
  },
  badgeText: { color: palette.danger, fontSize: 9, fontWeight: "700" },
  summary: { color: palette.muted, fontSize: 12, marginTop: 5 },
  chevron: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "rgba(47,113,93,0.09)",
  },
  chevronExpanded: { backgroundColor: palette.green },
  expenseBody: {
    paddingHorizontal: spacing.md,
    backgroundColor: "rgba(255,253,247,0.82)",
  },
  expenseRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: "rgba(255,253,247,0.82)",
  },
  expenseBodyEnd: {
    height: spacing.md,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
  },
  emptyBody: {
    padding: spacing.md,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    backgroundColor: "rgba(255,253,247,0.82)",
  },
  sectionGap: { height: spacing.md },
});
