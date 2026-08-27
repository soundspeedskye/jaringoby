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
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { useTabBarClearance } from "@/shared/lib/use-tab-bar-clearance";
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
  type LocalDate,
} from "@/shared/model/types";
import { useCommentCounts } from "@/entities/expense/api/use-expense-comments";
import { useUserExpenses } from "@/entities/expense/api/use-expenses";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import type { Expense } from "@/shared/api/types";
import { toSeoulLocalDate } from "@/shared/lib/domain/date-time";
import { createWeekdayCalendarFromPeriod } from "@/shared/lib/domain/period";
import { formatDateLabel, formatMonthDay, formatWon } from "@/shared/lib/format";
import { expenseDetailHref } from "@/shared/lib/expense-route";

type Filter = "전체" | ExpenseCategory;

export function ExpenseListPage() {
  const router = useRouter();
  const tabBarClearance = useTabBarClearance();
  const refreshControl = usePullToRefreshControl();
  // 현재 챌린지(진행 중 period)의 지출만 노출한다. 지난 챌린지 지출은
  // 내 정보 · 지난 주차에서 확인하므로 여기서는 중복 노출하지 않는다.
  const { currentPeriod, currentUser } = useCurrentRoom();
  const ownExpenses = useUserExpenses(currentUser?.id, currentPeriod?.id);
  const commentCounts = useCommentCounts(ownExpenses);
  const [filter, setFilter] = useState<Filter>("전체");
  const [selectedDate, setSelectedDate] = useState<LocalDate | null>(null);
  const periodDays = useMemo(
    () => (currentPeriod ? createWeekdayCalendarFromPeriod(currentPeriod).days : []),
    [currentPeriod],
  );
  const activeSelectedDate = selectedDate && periodDays.some(
    (periodDay) => periodDay.date === selectedDate,
  )
    ? selectedDate
    : null;

  const toggleDate = useCallback((date: LocalDate) => {
    setSelectedDate((current) => current === date ? null : date);
  }, []);

  const visibleExpenses = useMemo(
    () =>
      ownExpenses.filter(
        (expense) =>
          (activeSelectedDate === null || toSeoulLocalDate(expense.occurredAt) === activeSelectedDate) &&
          (filter === "전체" || expense.category === filter),
      ),
    [activeSelectedDate, filter, ownExpenses],
  );
  const officialTotal = ownExpenses
    .filter(
      (expense) =>
        (activeSelectedDate === null || toSeoulLocalDate(expense.occurredAt) === activeSelectedDate) &&
        (filter === "전체" || expenseOfficialCategory(expense) === filter),
    )
    .reduce((sum, expense) => sum + expenseOfficialAmount(expense), 0);
  const temporaryTotal = visibleExpenses
    .reduce((sum, expense) => sum + expenseOptimisticAmount(expense), 0);
  const pendingDelta = temporaryTotal - officialTotal;
  const hasPending = ownExpenses.some((expense) =>
    hasPendingExpenseProjection(expense) && (
      (activeSelectedDate === null || toSeoulLocalDate(expense.occurredAt) === activeSelectedDate) &&
      (filter === "전체" || expense.category === filter || expenseOfficialCategory(expense) === filter)
    ),
  );
  const openExpense = useCallback(
    (expenseId: string, clientRequestId?: string) =>
      router.push(expenseDetailHref(expenseId, clientRequestId)),
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
        clientRequestId={expense.clientRequestId}
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
    <ScreenFrame
      fixedHeader={
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
      }
      testID="expenses-screen">
      <FlatList
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        data={visibleExpenses}
        ItemSeparatorComponent={ExpenseSeparator}
        keyExtractor={(expense) => expense.id}
        ListEmptyComponent={
          <EmptyState
            title={activeSelectedDate ? `${formatMonthDay(activeSelectedDate)}에는 지출이 없어요.` : "이 카테고리의 지출이 없어요."}
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
            <View style={styles.totalCard}>
              <View style={styles.totalValueRow}>
                <Text style={styles.totalValue}>
                  {formatWon(hasPending ? temporaryTotal : officialTotal)}
                </Text>
                <Text style={styles.totalMeta}>{visibleExpenses.length}건</Text>
              </View>
              {hasPending ? (
                <Text style={styles.pendingMeta}>
                  서버 공식 {formatWon(officialTotal)} ·{" "}
                  {pendingDelta === 0
                    ? "금액 외 변경 대기"
                    : `대기 반영 ${formatSignedWon(pendingDelta)}`}
                </Text>
              ) : null}

              <View
                accessibilityLabel="지출 날짜 필터"
                accessibilityRole="radiogroup"
                style={styles.dateFilters}
              >
                <Pressable
                  accessibilityLabel="전체 기간 지출 보기"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activeSelectedDate === null }}
                  onPress={() => setSelectedDate(null)}
                  style={({ pressed }) => [
                    styles.allDateButton,
                    activeSelectedDate === null && styles.allDateButtonSelected,
                    pressed && styles.dateButtonPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.allDateLabel,
                      activeSelectedDate === null && styles.allDateLabelSelected,
                    ]}
                  >
                    전체 기간
                  </Text>
                </Pressable>
                <View style={styles.dateChips}>
                  {periodDays.map((periodDay) => {
                    const selected = activeSelectedDate === periodDay.date;
                    return (
                      <Pressable
                        accessibilityLabel={`${formatMonthDay(periodDay.date)} 지출 보기${selected ? ", 선택됨" : ""}`}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        key={periodDay.date}
                        onPress={() => toggleDate(periodDay.date)}
                        style={({ pressed }) => [
                          styles.dateChip,
                          selected && styles.dateChipSelected,
                          pressed && styles.dateButtonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dateChipLabel,
                            selected && styles.dateChipLabelSelected,
                          ]}
                        >
                          {periodDay.date.slice(8, 10)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
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
        refreshControl={refreshControl}
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
  totalValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: 5,
  },
  totalValue: {
    color: palette.cream,
    fontFamily: fonts.number,
    fontSize: 30,
    fontWeight: "700",
    ...tabularNums,
  },
  totalMeta: { color: "rgba(253,246,227,0.76)", fontFamily: fonts.number, fontSize: 14, ...tabularNums },
  pendingMeta: { color: "rgba(253,246,227,0.82)", fontFamily: fonts.hand, fontSize: 11, marginTop: 5, ...tabularNums },
  dateFilters: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  allDateButton: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  allDateButtonSelected: { backgroundColor: "rgba(255,255,255,0.22)" },
  allDateLabel: { color: "rgba(253,246,227,0.78)", fontFamily: fonts.handBold, fontSize: 11, fontWeight: "600" },
  allDateLabelSelected: { color: palette.cream },
  dateChips: { flex: 1, flexDirection: "row", justifyContent: "flex-end", gap: 4 },
  dateChip: {
    width: 30,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  dateChipSelected: { backgroundColor: palette.cream },
  dateChipLabel: { color: palette.cream, fontFamily: fonts.number, fontSize: 12, ...tabularNums },
  dateChipLabelSelected: { color: palette.green, fontSize: 14, fontWeight: "700" },
  dateButtonPressed: { opacity: 0.78, transform: [{ scale: 0.96 }] },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  footer: { marginTop: spacing.xl },
  separator: { height: spacing.lg },
});
