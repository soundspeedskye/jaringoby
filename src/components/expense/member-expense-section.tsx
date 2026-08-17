import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { ExpenseCard } from "@/components/expense/expense-card";
import type { MemberListItem } from "@/components/room/member-list";
import { EmptyState } from "@/shared/ui/empty-state";
import { fonts, palette, radii, spacing, tabularNums } from "@/shared/config/design";
import {
  expenseOfficialAmount,
  expensePendingDelta,
  hasPendingExpenseProjection,
} from "@/shared/api/expense-sync";
import type { Expense } from "@/shared/api/types";
import { formatDateLabel, formatWon } from "@/shared/lib/format";

type MemberExpenseSectionHeaderProps = {
  expenses: Expense[];
  member: MemberListItem;
};

export const MemberExpenseSectionHeader = memo(
  function MemberExpenseSectionHeader({
    expenses,
    member,
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
      <View
        accessible
        accessibilityLabel={`${member.isCrowned ? "현재 1위, " : ""}${displayName}, 지출 ${expenses.length}건, 공식 합계 ${formatWon(total)}${hasPending ? `, ${pendingSummary}` : ""}`}
        style={styles.header}
      >
        <AnimalAvatar photoUri={member.avatarUri} value={member.avatar} size={44} style={styles.avatar} />

        <View style={styles.memberCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {member.isCrowned ? "👑 " : ""}
              {displayName}
            </Text>
          </View>
          <Text style={styles.summary}>
            {expenses.length
              ? `${expenses.length}건 · 공식 ${formatWon(total)}${hasPending ? ` · ${pendingSummary}` : ""}`
              : "아직 지출 없음"}
          </Text>
        </View>

      </View>
    );
  },
  areHeaderPropsEqual,
);

export const MemberExpenseRow = memo(function MemberExpenseRow({
  avatar,
  avatarUri,
  commentCount,
  displayName,
  expense,
  isCrowned,
  onPress,
}: {
  avatar: string;
  avatarUri?: string;
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
        pointAmount={expense.pointAmount}
        avatar={avatar}
        avatarUri={avatarUri}
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
  member,
  hasExpenses,
}: {
  member: MemberListItem;
  hasExpenses: boolean;
}) {
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
    previous.expenses === next.expenses &&
    previousMember.id === nextMember.id &&
    previousMember.nickname === nextMember.nickname &&
    previousMember.avatar === nextMember.avatar &&
    previousMember.detail === nextMember.detail &&
    previousMember.remaining === nextMember.remaining &&
    previousMember.isCrowned === nextMember.isCrowned &&
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
    borderColor: palette.line,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    backgroundColor: palette.paper,
  },
  avatar: {
    borderWidth: 1,
    borderColor: palette.line,
  },
  memberCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    flexShrink: 1,
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 15,
    fontWeight: "700",
  },
  summary: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12, marginTop: 5, ...tabularNums },
  expenseBody: {
    paddingHorizontal: spacing.md,
    backgroundColor: palette.paper,
  },
  expenseRow: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: palette.paper,
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
    backgroundColor: palette.paper,
  },
  sectionGap: { height: spacing.md },
});
