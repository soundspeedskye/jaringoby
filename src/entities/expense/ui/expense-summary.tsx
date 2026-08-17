import { Image } from "expo-image";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { Expense, Period, Profile, Room } from "@/shared/api/types";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { formatDateLabel, formatWon } from "@/shared/lib/format";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";

export const ExpenseSummary = memo(function ExpenseSummary({
  author,
  period,
  room,
  expense,
}: {
  author?: Profile;
  period?: Period;
  room?: Room;
  expense: Expense;
}) {
  return (
    <View style={styles.expenseCard}>
      <View style={styles.expenseHeader}>
        <View style={styles.authorRow}>
          <AnimalAvatar
            photoUri={author?.avatarUri}
            value={author?.avatar}
            size={40}
            style={styles.avatar}
          />
          <View style={styles.authorCopy}>
            <Text style={styles.authorName}>
              {author?.nickname ?? "알 수 없음"}
            </Text>
            <Text style={styles.expenseMeta}>
              {expense.category} · {formatDateLabel(expense.occurredAt)}
              {expense.createdAt !== expense.updatedAt ? " · 수정됨" : ""}
            </Text>
          </View>
        </View>
        <View style={styles.expenseAmounts}>
          <Text style={styles.expenseAmount}>{formatWon(expense.amount)}</Text>
          {expense.pointAmount > 0 ? (
            <Text style={styles.expensePointAmount}>
              포인트 {formatWon(expense.pointAmount)}
            </Text>
          ) : null}
        </View>
      </View>
      <Image
        accessibilityLabel={`${expense.category} 지출 사진`}
        contentFit="contain"
        source={{ uri: expense.photoUri }}
        style={styles.expensePhoto}
      />
      <View style={styles.expenseCopy}>
        <Text style={styles.expenseMemo}>{expense.memo || "메모 없음"}</Text>
        {period ? (
          <Text style={styles.periodLabel}>
            {room ? `${room.name} · ` : ""}
            {period.weekIndex}주차
          </Text>
        ) : null}
        {expense.syncStatus !== "SYNCED" ? (
          <Text style={styles.sync}>
            {expense.syncStatus === "PENDING"
              ? "동기화 대기"
              : "전송 실패 · 다시 시도 필요"}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  expenseCard: {
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: palette.paper,
  },
  expenseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    padding: spacing.md,
  },
  authorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {},
  authorCopy: { flex: 1 },
  authorName: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  expenseMeta: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    marginTop: 3,
    ...tabularNums,
  },
  expenseAmount: {
    color: palette.coralText,
    fontFamily: fonts.number,
    fontSize: 17,
    fontWeight: "800",
    ...tabularNums,
  },
  expenseAmounts: { alignItems: "flex-end", marginLeft: spacing.sm },
  expensePointAmount: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    marginTop: 2,
    ...tabularNums,
  },
  expensePhoto: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: palette.line,
  },
  expenseCopy: { padding: spacing.md, gap: 5 },
  expenseMemo: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 14,
    lineHeight: 21,
  },
  periodLabel: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 11,
    fontWeight: "600",
  },
  sync: { color: palette.coralText, fontFamily: fonts.hand, fontSize: 10 },
});
