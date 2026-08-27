import { memo, useCallback } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type ListRenderItemInfo } from "react-native";

import { ExpensePhoto } from "@/entities/expense/ui/expense-photo";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import {
  fonts,
  palette,
  radii,
  shadow,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import type { Expense, Profile } from "@/shared/api/types";
import { formatDateLabel, formatWon } from "@/shared/lib/format";

const CARD_WIDTH = 272;

export const RecentExpenseCarousel = memo(function RecentExpenseCarousel({
  commentCounts,
  expenses,
  onOpenExpense,
  onOpenMemberFeed,
  profilesById,
}: {
  commentCounts: ReadonlyMap<string, number>;
  expenses: readonly Expense[];
  onOpenExpense: (expenseId: string, clientRequestId?: string) => void;
  onOpenMemberFeed: (userId: string) => void;
  profilesById: ReadonlyMap<string, Profile>;
}) {
  const renderExpense = useCallback(
    ({ item: expense }: ListRenderItemInfo<Expense>) => (
      <RecentExpenseCard
        commentCount={commentCounts.get(expense.id) ?? 0}
        expense={expense}
        onOpenExpense={onOpenExpense}
        onOpenMemberFeed={onOpenMemberFeed}
        profile={profilesById.get(expense.userId)}
      />
    ),
    [commentCounts, onOpenExpense, onOpenMemberFeed, profilesById],
  );

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          최근 피드
        </Text>
      </View>
      {expenses.length ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={expenses}
          horizontal
          keyExtractor={(expense) => expense.id}
          nestedScrollEnabled
          renderItem={renderExpense}
          showsHorizontalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            이번 주 지출을 등록하면 최근 피드에 모여요.
          </Text>
        </View>
      )}
    </View>
  );
});

const RecentExpenseCard = memo(function RecentExpenseCard({
  commentCount,
  expense,
  onOpenExpense,
  onOpenMemberFeed,
  profile,
}: {
  commentCount: number;
  expense: Expense;
  onOpenExpense: (expenseId: string, clientRequestId?: string) => void;
  onOpenMemberFeed: (userId: string) => void;
  profile?: Profile;
}) {
  const openExpense = useCallback(
    () => onOpenExpense(expense.id, expense.clientRequestId),
    [expense.clientRequestId, expense.id, onOpenExpense],
  );
  const openMemberFeed = useCallback(() => onOpenMemberFeed(expense.userId), [expense.userId, onOpenMemberFeed]);
  return (
    <Pressable
      accessibilityLabel={`${profile?.nickname ?? "알 수 없음"}님의 ${expense.category} ${formatWon(expense.amount)} 게시글`}
      accessibilityRole="button"
      onPress={openExpense}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Pressable
          accessibilityLabel={`${profile?.nickname ?? "작성자"}님의 피드 보기`}
          accessibilityRole="button"
          hitSlop={5}
          onPress={(event) => {
            event.stopPropagation();
            openMemberFeed();
          }}
          style={styles.author}
        >
          <AnimalAvatar photoUri={profile?.avatarUri} size={30} value={profile?.avatar ?? ""} />
          <View style={styles.authorCopy}>
            <Text numberOfLines={1} style={styles.authorName}>
              {profile?.nickname ?? "알 수 없음"}
            </Text>
            <Text style={styles.when}>{formatDateLabel(expense.createdAt)}</Text>
          </View>
        </Pressable>
        <Text style={styles.amount}>{formatWon(expense.amount)}</Text>
      </View>
      <ExpensePhoto
        accessibilityLabel={`${expense.category} 지출 사진`}
        photoPath={expense.photoPath}
        photoThumbnailUri={expense.photoThumbnailUri}
        photoUri={expense.photoUri}
        style={styles.photo}
        variant="thumbnail"
      />
      <View style={styles.cardFooter}>
        <Text numberOfLines={1} style={styles.memo}>
          {expense.memo || expense.category}
        </Text>
        <Text style={styles.comments}>댓글 {commentCount}개</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl, marginBottom: spacing.xl },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  title: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 20,
    fontWeight: "800",
  },
  meta: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    ...tabularNums,
  },
  list: { gap: spacing.md, paddingRight: spacing.xl },
  emptyCard: {
    minHeight: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  emptyText: { color: palette.muted, fontFamily: fonts.hand, fontSize: 13 },
  card: {
    width: CARD_WIDTH,
    overflow: "hidden",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    ...shadow,
  },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    padding: spacing.sm,
  },
  author: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  authorCopy: { flex: 1, minWidth: 0 },
  authorName: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  when: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 9,
    marginTop: 2,
  },
  amount: {
    color: palette.coralText,
    fontFamily: fonts.number,
    fontSize: 14,
    fontWeight: "700",
    ...tabularNums,
  },
  photo: { width: "100%", aspectRatio: 4 / 3, backgroundColor: palette.line },
  cardFooter: { gap: 5, padding: spacing.sm },
  memo: { color: palette.ink, fontFamily: fonts.hand, fontSize: 12 },
  comments: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10 },
});
