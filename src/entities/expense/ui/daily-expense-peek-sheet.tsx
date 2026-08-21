import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { GlassView } from "expo-glass-effect";
import { memo, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { fonts, glass, palette, radii, spacing, tabularNums } from "@/shared/config/design";
import { toSeoulLocalDate } from "@/shared/lib/domain/date-time";
import {
  formatLocalDateWithWeekday,
  formatTimeLabel,
  formatWon,
} from "@/shared/lib/format";
import { useLiquidGlass } from "@/shared/lib/use-liquid-glass";
import type { Expense, Profile } from "@/shared/api/types";

type DailyExpensePeekSheetProps = {
  date: string | null;
  expenses: readonly Expense[];
  profilesById: ReadonlyMap<string, Profile>;
  onClose: () => void;
};

/**
 * 홈의 날짜칩에서 열리는 짧은 확인용 시트다. 기록을 읽기만 하며 상세 화면으로
 * 이어지지 않아, 커뮤니티와 최근 피드의 흐름을 건드리지 않는다.
 */
export const DailyExpensePeekSheet = memo(function DailyExpensePeekSheet({
  date,
  expenses,
  profilesById,
  onClose,
}: DailyExpensePeekSheetProps) {
  const insets = useSafeAreaInsets();
  const liquidGlass = useLiquidGlass();
  const dayExpenses = useMemo(
    () =>
      date
        ? expenses
            .filter((expense) => toSeoulLocalDate(expense.occurredAt) === date)
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        : [],
    [date, expenses],
  );
  const total = dayExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <Modal
      accessibilityViewIsModal
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={Boolean(date)}
    >
      {date ? (
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="일별 지출 기록 닫기"
            onPress={onClose}
            style={styles.dismissArea}
          />
          <View style={[styles.sheetWrap, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            {liquidGlass ? (
              <GlassView
                glassEffectStyle="regular"
                style={styles.glassSheet}
                tintColor={glass.tint}
              >
                <SheetContents
                  date={date}
                  dayExpenses={dayExpenses}
                  onClose={onClose}
                  profilesById={profilesById}
                  total={total}
                />
              </GlassView>
            ) : (
              <View style={styles.paperSheet}>
                <SheetContents
                  date={date}
                  dayExpenses={dayExpenses}
                  onClose={onClose}
                  profilesById={profilesById}
                  total={total}
                />
              </View>
            )}
          </View>
        </View>
      ) : null}
    </Modal>
  );
});

function SheetContents({
  date,
  dayExpenses,
  onClose,
  profilesById,
  total,
}: {
  date: string;
  dayExpenses: readonly Expense[];
  onClose: () => void;
  profilesById: ReadonlyMap<string, Profile>;
  total: number;
}) {
  return (
    <>
      <View style={styles.header}>
        <View>
          <Text accessibilityRole="header" style={styles.title}>
            {formatLocalDateWithWeekday(date)} 지출
          </Text>
          <Text style={styles.summary}>
            {dayExpenses.length}건 · {formatWon(total)}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="닫기"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
        >
          <MaterialCommunityIcons color={palette.green} name="close" size={21} />
        </Pressable>
      </View>

      {dayExpenses.length ? (
        <ScrollView
          contentContainerStyle={styles.records}
          showsVerticalScrollIndicator={false}
        >
          {dayExpenses.map((expense) => {
            const profile = profilesById.get(expense.userId);
            return (
              <View key={expense.id} style={styles.record}>
                <AnimalAvatar
                  photoUri={profile?.avatarUri}
                  size={34}
                  value={profile?.avatar ?? ""}
                />
                <View style={styles.recordCopy}>
                  <Text numberOfLines={1} style={styles.recordTitle}>
                    {expense.memo || expense.category}
                  </Text>
                  <Text style={styles.recordMeta}>
                    {profile?.nickname ?? "알 수 없음"} · {expense.category} · {formatTimeLabel(expense.occurredAt)}
                  </Text>
                </View>
                <Text style={styles.amount}>{formatWon(expense.amount)}</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons color={palette.greenSoft} name="receipt-text-outline" size={25} />
          <Text style={styles.emptyTitle}>기록한 지출이 없어요.</Text>
          <Text style={styles.emptyBody}>이 날의 지출은 아직 등록되지 않았어요.</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  dismissArea: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(42,38,32,0.20)",
  },
  sheetWrap: { paddingHorizontal: spacing.md },
  glassSheet: {
    maxHeight: "58%",
    overflow: "hidden",
    borderRadius: 28,
    padding: spacing.xl,
  },
  paperSheet: {
    maxHeight: "58%",
    overflow: "hidden",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    padding: spacing.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  title: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 20, fontWeight: "800" },
  summary: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12, marginTop: 3, ...tabularNums },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(47,113,93,0.10)",
  },
  closeButtonPressed: { opacity: 0.72, transform: [{ scale: 0.94 }] },
  records: { gap: spacing.sm, paddingBottom: spacing.xs },
  record: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(42,38,32,0.15)",
  },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: "700" },
  recordMeta: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: 3 },
  amount: { color: palette.coralText, fontFamily: fonts.number, fontSize: 14, fontWeight: "800", ...tabularNums },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 15, fontWeight: "700" },
  emptyBody: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
});
