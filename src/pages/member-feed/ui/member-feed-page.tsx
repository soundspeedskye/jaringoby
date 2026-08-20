import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from "react-native";

import { ExpenseCard } from "@/entities/expense/ui/expense-card";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { ScreenFrame } from "@/shared/ui/screen";
import { fonts, palette, spacing } from "@/shared/config/design";
import {
  compareExpenseFeedOrder,
  isFeedVisibleExpense,
} from "@/shared/api/expense-sync";
import { useCommentCounts } from "@/entities/expense/api/use-expense-comments";
import { useUserExpenses } from "@/entities/expense/api/use-expenses";
import { useProfiles } from "@/entities/member/api/use-members";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import { formatDateLabel, formatMonthDay } from "@/shared/lib/format";
import type { Expense } from "@/shared/api/types";

export function MemberFeedPage() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<"/room/member/[userId]">();
  const { activeRoom, currentPeriod, currentUser } = useCurrentRoom();
  // 지출은 자기 주차에 속한다. 이 피드는 진행 중인 주차만 보여 주고, 지난
  // 주차 기록은 내 정보 · 지난 주차에서 읽기 전용으로 확인한다.
  const periodExpenses = useUserExpenses(userId, currentPeriod?.id);
  const expenses = useMemo(
    () => periodExpenses.filter(isFeedVisibleExpense).sort(compareExpenseFeedOrder),
    [periodExpenses],
  );
  const profilesById = useProfiles(userId ? [userId] : []);
  const commentCounts = useCommentCounts(expenses);
  const profile = userId ? profilesById.get(userId) : undefined;
  const displayName =
    userId === currentUser?.id ? "나" : (profile?.nickname ?? "멤버");
  const subtitle = useMemo(() => {
    if (!currentPeriod) return activeRoom?.name;
    const weekLabel = `${currentPeriod.weekIndex}주차 ${formatMonthDay(currentPeriod.weekStart)}~${formatMonthDay(currentPeriod.weekEnd)}`;
    return activeRoom ? `${activeRoom.name} · ${weekLabel}` : weekLabel;
  }, [activeRoom, currentPeriod]);
  const openExpense = useCallback(
    (expenseId: string) => router.push(`/expense/${expenseId}`),
    [router],
  );
  const renderExpense = useCallback(
    ({ item: expense }: ListRenderItemInfo<Expense>) => (
      <View style={styles.cardWrap}>
        <ExpenseCard
          amount={expense.amount}
          avatar={profile?.avatar ?? ""}
          avatarUri={profile?.avatarUri}
          category={expense.category}
          commentCount={commentCounts.get(expense.id) ?? 0}
          hideAuthor
          id={expense.id}
          memo={expense.memo}
          nickname={displayName}
          occurredAtLabel={formatDateLabel(expense.occurredAt)}
          onPress={openExpense}
          photoPath={expense.photoPath}
          photoThumbnailUri={expense.photoThumbnailUri}
          photoUri={expense.photoUri}
          pointAmount={expense.pointAmount}
        />
      </View>
    ),
    [commentCounts, displayName, openExpense, profile?.avatar, profile?.avatarUri],
  );

  return (
    <ScreenFrame
      fixedHeader={
        <PageHeader
          onBack={() => router.back()}
          subtitle={subtitle}
          title={`${displayName}님의 이번 주차`}
        />
      }
      testID="member-feed-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={expenses}
        keyExtractor={(expense) => expense.id}
        ListEmptyComponent={
          <EmptyState
            description="지난 주차 기록은 내 정보 · 지난 주차에서 볼 수 있어요."
            icon="receipt-text-outline"
            title="이번 주차에 기록한 지출이 없어요."
          />
        }
        renderItem={renderExpense}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  description: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    marginBottom: spacing.lg,
  },
  cardWrap: { marginBottom: spacing.md },
});
