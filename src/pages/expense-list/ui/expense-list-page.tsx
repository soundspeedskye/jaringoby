import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";

import { ExpenseCard } from "@/entities/expense/ui/expense-card";
import { ChoiceChip } from "@/shared/ui/choice-chip";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { ScreenFrame } from "@/shared/ui/screen";
import { fonts, palette, radii, spacing, tabularNums } from "@/shared/config/design";
import {
  expenseOfficialAmount,
  expenseOfficialCategory,
  expenseOptimisticAmount,
  hasPendingExpenseProjection,
} from "@/shared/api/expense-sync";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/shared/model/types";
import { useCommentCounts } from "@/entities/expense/api/use-expense-comments";
import { useUserExpenses } from "@/entities/expense/api/use-expenses";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import type { Expense } from "@/shared/api/types";
import { formatDateLabel, formatWon } from "@/shared/lib/format";

type Filter = "전체" | ExpenseCategory;

export function ExpenseListPage() {
  const router = useRouter();
  // 현재 챌린지(진행 중 period)의 지출만 노출한다. 지난 챌린지 지출은
  // 내 정보 · 지난 주차에서 확인하므로 여기서는 중복 노출하지 않는다.
  const { currentPeriod, currentUser } = useCurrentRoom();
  const ownExpenses = useUserExpenses(currentUser?.id, currentPeriod?.id);
  const commentCounts = useCommentCounts(ownExpenses);
  const [filter, setFilter] = useState<Filter>("전체");
  const visibleExpenses = useMemo(
    () =>
      filter === "전체"
        ? ownExpenses
        : ownExpenses.filter((expense) => expense.category === filter),
    [filter, ownExpenses],
  );
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
  const openExpense = useCallback(
    (expenseId: string) => router.push(`/expense/${expenseId}`),
    [router],
  );
  const renderExpense = useCallback(
    ({ item: expense }: ListRenderItemInfo<Expense>) => (
      <ExpenseCard
        amount={expense.amount}
        pointAmount={expense.pointAmount}
        avatar={currentUser?.avatar ?? ""}
        category={expense.category}
        commentCount={commentCounts.get(expense.id) ?? 0}
        edited={expense.createdAt !== expense.updatedAt}
        id={expense.id}
        memo={expense.memo}
        nickname="나"
        occurredAtLabel={formatDateLabel(expense.occurredAt)}
        onPress={openExpense}
        photoPath={expense.photoPath}
        photoThumbnailUri={expense.photoThumbnailUri}
        photoUri={expense.photoUri}
      />
    ),
    [commentCounts, currentUser?.avatar, openExpense],
  );

  return (
    <ScreenFrame testID="expenses-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={visibleExpenses}
        ItemSeparatorComponent={ExpenseSeparator}
        keyExtractor={(expense) => expense.id}
        ListEmptyComponent={
          <EmptyState
            title="이 카테고리의 지출이 없어요."
            variant="compact"
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <PrimaryButton
              label="사진과 함께 지출 추가"
              onPress={() => router.push("/expense/new")}
            />
          </View>
        }
        ListHeaderComponent={
          <>
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
              <Text style={styles.totalValue}>
                {formatWon(hasPending ? temporaryTotal : officialTotal)}
              </Text>
              {hasPending ? (
                <Text style={styles.pendingMeta}>
                  서버 공식 {formatWon(officialTotal)} ·{" "}
                  {pendingDelta === 0
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
              {(["전체", ...EXPENSE_CATEGORIES] as Filter[]).map(
                (category) => (
                  <ChoiceChip
                    key={category}
                    label={category}
                    onPress={() => setFilter(category)}
                    selected={filter === category}
                  />
                ),
              )}
            </View>
          </>
        }
        renderItem={renderExpense}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}

function ExpenseSeparator() {
  return <View style={styles.separator} />;
}

function formatSignedWon(value: number): string {
  return `${value > 0 ? "+" : "-"}${formatWon(Math.abs(value))}`;
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  historyButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
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
  totalLabel: { color: palette.cream, fontFamily: fonts.hand, fontSize: 13 },
  totalValue: {
    color: palette.cream,
    fontFamily: fonts.number,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 5,
    ...tabularNums,
  },
  totalMeta: { color: "rgba(253,246,227,0.76)", fontFamily: fonts.hand, fontSize: 11, ...tabularNums },
  pendingMeta: { color: "rgba(253,246,227,0.82)", fontFamily: fonts.hand, fontSize: 11, marginTop: 5, ...tabularNums },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  footer: { marginTop: spacing.xl },
  separator: { height: spacing.lg },
});
