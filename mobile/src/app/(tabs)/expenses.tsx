import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExpenseCard } from "@/components/expense/expense-card";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
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
  const total = visibleExpenses.reduce(
    (sum, expense) => sum + expense.amount,
    0,
  );

  return (
    <Screen testID="expenses-screen">
      <View style={styles.header}>
        <Text style={styles.title}>내 지출</Text>
        <Pressable
          accessibilityLabel="지난 챌린지"
          onPress={() => router.push("/history")}
          style={styles.historyButton}
        >
          <MaterialCommunityIcons
            color={palette.green}
            name="archive-outline"
            size={22}
          />
        </Pressable>
      </View>

      <View style={styles.totalCard}>
        <View style={styles.totalHeader}>
          <Text style={styles.totalLabel}>{filter} 지출 합계</Text>
          <Text style={styles.totalMeta}>{visibleExpenses.length}건</Text>
        </View>
        <Text style={styles.totalValue}>{formatWon(total)}</Text>
      </View>

      <View style={styles.filters}>
        {(["전체", ...EXPENSE_CATEGORIES] as Filter[]).map((category) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filter === category }}
            key={category}
            onPress={() => setFilter(category)}
            style={[
              styles.filterChip,
              filter === category && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                filter === category && styles.filterTextActive,
              ]}
            >
              {category}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.list}>
        {visibleExpenses.map((expense) => (
          <ExpenseCard
            amount={expense.amount}
            avatar={currentUser?.avatar ?? "🙂"}
            category={expense.category}
            commentCount={getComments(expense.id).length}
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
        <Text style={styles.empty}>이 카테고리의 지출이 없어요.</Text>
      ) : null}
      <PrimaryButton
        label="사진과 함께 지출 추가"
        onPress={() => router.push("/expense/new")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.xl,
  },
  title: { color: palette.ink, fontSize: 30, fontWeight: "700", marginTop: 4 },
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.44)",
  },
  filterChipActive: {
    backgroundColor: palette.green,
    borderColor: palette.green,
  },
  filterText: { color: palette.muted, fontSize: 12 },
  filterTextActive: { color: palette.cream, fontWeight: "600" },
  list: { gap: spacing.lg, marginBottom: spacing.xl },
  empty: {
    color: palette.muted,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },
});
