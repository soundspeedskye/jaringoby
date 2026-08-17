import { Image } from "expo-image";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

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

export function RecentExpenseCarousel({
  commentCounts,
  expenses,
  onOpenExpense,
  onOpenMemberFeed,
  profilesById,
}: {
  commentCounts: ReadonlyMap<string, number>;
  expenses: readonly Expense[];
  onOpenExpense: (expenseId: string) => void;
  onOpenMemberFeed: (userId: string) => void;
  profilesById: ReadonlyMap<string, Profile>;
}) {
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
          renderItem={({ item: expense }) => {
            const profile = profilesById.get(expense.userId);
            return (
              <Pressable
                accessibilityLabel={`${profile?.nickname ?? "알 수 없음"}님의 ${expense.category} ${formatWon(expense.amount)} 게시글`}
                accessibilityRole="button"
                onPress={() => onOpenExpense(expense.id)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.cardHeader}>
                  <Pressable
                    accessibilityLabel={`${profile?.nickname ?? "작성자"}님의 피드 보기`}
                    accessibilityRole="button"
                    hitSlop={5}
                    onPress={(event) => {
                      event.stopPropagation();
                      onOpenMemberFeed(expense.userId);
                    }}
                    style={styles.author}
                  >
                    <AnimalAvatar
                      photoUri={profile?.avatarUri}
                      size={30}
                      value={profile?.avatar ?? ""}
                    />
                    <View style={styles.authorCopy}>
                      <Text numberOfLines={1} style={styles.authorName}>
                        {profile?.nickname ?? "알 수 없음"}
                      </Text>
                      <Text style={styles.when}>
                        {formatDateLabel(expense.createdAt)}
                      </Text>
                    </View>
                  </Pressable>
                  <Text style={styles.amount}>{formatWon(expense.amount)}</Text>
                </View>
                <Image
                  accessibilityLabel={`${expense.category} 지출 사진`}
                  contentFit="contain"
                  source={{ uri: expense.photoUri }}
                  style={styles.photo}
                />
                <View style={styles.cardFooter}>
                  <Text numberOfLines={1} style={styles.memo}>
                    {expense.memo || expense.category}
                  </Text>
                  <Text style={styles.comments}>
                    댓글 {commentCounts.get(expense.id) ?? 0}개
                  </Text>
                </View>
              </Pressable>
            );
          }}
          showsHorizontalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            첫 지출을 등록하면 최근 피드에 모여요.
          </Text>
        </View>
      )}
    </View>
  );
}

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
