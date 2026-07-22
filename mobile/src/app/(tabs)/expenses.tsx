import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExpenseCard } from "@/components/expense/expense-card";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import {
  expenseOfficialAmount,
  expenseOfficialCategory,
  expenseOptimisticAmount,
  hasPendingExpenseProjection,
} from "@/data/expense-sync";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/domain";
import { useAppData } from "@/providers/app-provider";
import { formatDateLabel, formatWon } from "@/utils/format";

type Filter = "전체" | ExpenseCategory;

export default function ExpensesScreen() {
  const router = useRouter();
  const { currentUser, getComments, getUserExpenses } = useAppData();
  const [filter, setFilter] = useState<Filter>("전체");
  const ownExpenses = useMemo(
    () => (currentUser ? getUserExpenses(currentUser.id) : []),
    [currentUser, getUserExpenses],
  );
  const visibleExpenses =
    filter === "전체"
      ? ownExpenses
      : ownExpenses.filter((expense) => expense.category === filter);
  const officialTotal = ownExpenses
    .filter((expense) => filter === "전체" || expenseOfficialCategory(expense) === filter)
    .reduce((sum, expense) => sum + expenseOfficialAmount(expense), 0);
  const temporaryTotal = visibleExpenses
    .reduce((sum, expense) => sum + expenseOptimisticAmount(expense), 0);
  const pendingDelta = temporaryTotal - officialTotal;
  const hasPending = ownExpenses.some((expense) =>
    hasPendingExpenseProjection(expense) && (
      filter === "전체" || expense.category === filter || expenseOfficialCategory(expense) === filter
    ),
  );

  return (
    <Screen testID="expenses-screen">
      <PageHeader
        bottomSpacing="xl"
        right={
          <Pressable
            accessibilityLabel="지난 챌린지"
            accessibilityRole="button"
            onPress={() => router.push("/history")}
            style={styles.historyButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="archive-outline"
              size={22}
            />
          </Pressable>
        }
        title="내 지출"
      />

      <View style={styles.totalCard}>
        <View style={styles.totalHeader}>
          <Text style={styles.totalLabel}>
            {filter} {hasPending ? "임시 합계" : "지출 합계"}
          </Text>
          <Text style={styles.totalMeta}>{visibleExpenses.length}건</Text>
        </View>
        <Text style={styles.totalValue}>{formatWon(hasPending ? temporaryTotal : officialTotal)}</Text>
        {hasPending ? (
          <Text style={styles.pendingMeta}>
            서버 공식 {formatWon(officialTotal)} · {pendingDelta === 0
              ? "금액 외 변경 대기"
              : `대기 반영 ${formatSignedWon(pendingDelta)}`}
          </Text>
        ) : null}
      </View>

      <View
        accessibilityLabel="지출 카테고리 필터"
        accessibilityRole="radiogroup"
        style={styles.filters}
      >
        {(["전체", ...EXPENSE_CATEGORIES] as Filter[]).map((category) => (
          <ChoiceChip
            key={category}
            label={category}
            onPress={() => setFilter(category)}
            selected={filter === category}
          />
        ))}
      </View>

      <View style={styles.list}>
        {visibleExpenses.map((expense) => (
          <ExpenseCard
            amount={expense.amount}
            avatar={currentUser?.avatar ?? "🙂"}
            category={expense.category}
            commentCount={
              getComments(expense.id).filter((comment) => !comment.deletedAt)
                .length
            }
            edited={expense.createdAt !== expense.updatedAt}
            id={expense.id}
            key={expense.id}
            memo={expense.memo}
            nickname="나"
            occurredAtLabel={formatDateLabel(expense.occurredAt)}
            onPress={(id) => router.push(`/expense/${id}`)}
            photoUri={expense.photoUri ?? ""}
          />
        ))}
      </View>
      {!visibleExpenses.length ? (
        <EmptyState
          title="이 카테고리의 지출이 없어요."
          variant="compact"
        />
      ) : null}
      <PrimaryButton
        label="사진과 함께 지출 추가"
        onPress={() => router.push("/expense/new")}
      />
    </Screen>
  );
}

function formatSignedWon(value: number): string {
  return `${value > 0 ? "+" : "-"}${formatWon(Math.abs(value))}`;
}

const styles = StyleSheet.create({
  historyButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  totalCard: {
    padding: spacing.xl,
    backgroundColor: palette.green,
    borderRadius: radii.lg,
  },
  totalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLabel: { color: palette.cream, fontSize: 13 },
  totalValue: {
    color: palette.cream,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 5,
  },
  totalMeta: { color: "rgba(253,246,227,0.76)", fontSize: 11 },
  pendingMeta: { color: "rgba(253,246,227,0.82)", fontSize: 11, marginTop: 5 },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  list: { gap: spacing.lg, marginBottom: spacing.xl },
});
