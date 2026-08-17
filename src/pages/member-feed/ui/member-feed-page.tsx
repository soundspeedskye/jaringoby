import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { ExpenseCard } from "@/entities/expense/ui/expense-card";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { ScreenFrame } from "@/shared/ui/screen";
import { fonts, palette, spacing } from "@/shared/config/design";
import { useCommentCounts } from "@/entities/expense/api/use-expense-comments";
import { useMemberRoomFeedExpenses } from "@/entities/expense/api/use-expenses";
import { useProfiles } from "@/entities/member/api/use-members";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import { formatDateLabel } from "@/shared/lib/format";

export function MemberFeedPage() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<"/room/member/[userId]">();
  const { activeRoom, currentUser } = useCurrentRoom();
  const expenses = useMemberRoomFeedExpenses(activeRoom?.id, userId);
  const profilesById = useProfiles(userId ? [userId] : []);
  const commentCounts = useCommentCounts(expenses);
  const profile = userId ? profilesById.get(userId) : undefined;
  const displayName =
    userId === currentUser?.id ? "나" : (profile?.nickname ?? "멤버");

  return (
    <ScreenFrame testID="member-feed-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={expenses}
        keyExtractor={(expense) => expense.id}
        ListEmptyComponent={
          <EmptyState
            description="이 멤버가 기록한 지출은 여기에 최신순으로 모여요."
            icon="receipt-text-outline"
            title="아직 지출 기록이 없어요."
          />
        }
        ListHeaderComponent={
          <>
            <PageHeader
              onBack={() => router.back()}
              subtitle={activeRoom?.name}
              title={`${displayName}님의 피드`}
            />
          </>
        }
        renderItem={({ item: expense }) => (
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
              onPress={(expenseId) => router.push(`/expense/${expenseId}`)}
              photoUri={expense.photoUri ?? ""}
              pointAmount={expense.pointAmount}
            />
          </View>
        )}
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
