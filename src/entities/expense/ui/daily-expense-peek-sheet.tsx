import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { GlassView } from "expo-glass-effect";
import { memo, useCallback, useEffect, useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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

const SHEET_MIN_HEIGHT = 360;
const SHEET_HEIGHT_RATIO = 0.5;
const SHEET_TOP_GAP = 12;
const DISMISS_DISTANCE = 84;
const DISMISS_VELOCITY = 900;
const SHEET_ANIMATION = {
  duration: 240,
  easing: Easing.out(Easing.cubic),
};

/**
 * 홈의 날짜칩에서 열리는 읽기 전용 모달 바텀시트다. 탭 바를 포함한 홈 화면을
 * 가리지 않고 위에 겹쳐 보이되, 열린 동안에는 뒤 화면을 조작할 수 없다.
 */
export const DailyExpensePeekSheet = memo(function DailyExpensePeekSheet({
  date,
  expenses,
  profilesById,
  onClose,
}: DailyExpensePeekSheetProps) {
  const insets = useSafeAreaInsets();
  const liquidGlass = useLiquidGlass();
  const { height: windowHeight } = useWindowDimensions();
  const sheetOffset = useSharedValue(SHEET_MIN_HEIGHT);
  const panStartOffset = useSharedValue(0);
  const isClosing = useSharedValue(false);
  const preferredSheetHeight = Math.max(
    SHEET_MIN_HEIGHT,
    Math.floor(windowHeight * SHEET_HEIGHT_RATIO),
  );
  const sheetHeight = Math.max(
    0,
    Math.min(
      preferredSheetHeight,
      // 아주 작은 화면에서도 상단 안전 영역을 덮지 않는다.
      // 50% 높이와 최소 높이는 가능한 한 유지하고, 물리적으로 불가능한 경우에만 줄인다.
      windowHeight - insets.top - SHEET_TOP_GAP,
    ),
  );
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

  const dismiss = useCallback(() => {
    if (isClosing.get()) return;
    isClosing.set(true);
    sheetOffset.set(withTiming(
      sheetHeight,
      SHEET_ANIMATION,
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    ));
  }, [isClosing, onClose, sheetHeight, sheetOffset]);

  useEffect(() => {
    if (!date) return;
    isClosing.set(false);
    sheetOffset.set(sheetHeight);
    sheetOffset.set(withTiming(0, SHEET_ANIMATION));
  }, [date, isClosing, sheetHeight, sheetOffset]);

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, sheetOffset.get()) }],
  }));
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          panStartOffset.set(sheetOffset.get());
        })
        .onUpdate((event) => {
          sheetOffset.set(Math.min(
            sheetHeight,
            Math.max(0, panStartOffset.get() + event.translationY),
          ));
        })
        .onEnd((event) => {
          if (
            event.translationY > DISMISS_DISTANCE ||
            event.velocityY > DISMISS_VELOCITY
          ) {
            runOnJS(dismiss)();
            return;
          }
          sheetOffset.set(withTiming(0, SHEET_ANIMATION));
        }),
    [dismiss, panStartOffset, sheetHeight, sheetOffset],
  );

  return (
    <Modal
      accessibilityViewIsModal
      animationType="none"
      onRequestClose={dismiss}
      statusBarTranslucent
      transparent
      visible={Boolean(date)}
    >
      {date ? (
        <GestureHandlerRootView style={styles.gestureRoot}>
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityLabel="일별 지출 기록 닫기"
              accessibilityRole="button"
              onPress={dismiss}
              style={styles.dismissArea}
            />
            <Animated.View
              style={[
                styles.sheetWrap,
                {
                  height: sheetHeight,
                  paddingBottom: Math.max(insets.bottom, spacing.lg),
                },
                sheetAnimatedStyle,
              ]}
            >
              {liquidGlass ? (
                <GlassView
                  glassEffectStyle="regular"
                  style={styles.glassSheet}
                  tintColor={glass.tint}
                >
                  <SheetContents
                    date={date}
                    dayExpenses={dayExpenses}
                    onClose={dismiss}
                    panGesture={panGesture}
                    profilesById={profilesById}
                    total={total}
                  />
                </GlassView>
              ) : (
                <View style={styles.paperSheet}>
                  <SheetContents
                    date={date}
                    dayExpenses={dayExpenses}
                    onClose={dismiss}
                    panGesture={panGesture}
                    profilesById={profilesById}
                    total={total}
                  />
                </View>
              )}
            </Animated.View>
          </View>
        </GestureHandlerRootView>
      ) : null}
    </Modal>
  );
});

function SheetContents({
  date,
  dayExpenses,
  onClose,
  panGesture,
  profilesById,
  total,
}: {
  date: string;
  dayExpenses: readonly Expense[];
  onClose: () => void;
  panGesture: ReturnType<typeof Gesture.Pan>;
  profilesById: ReadonlyMap<string, Profile>;
  total: number;
}) {
  return (
    <View style={styles.sheetContent}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.dragArea}>
          <View style={styles.dragHandle} />
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
        </View>
      </GestureDetector>

      {dayExpenses.length ? (
        <ScrollView
          contentContainerStyle={styles.records}
          showsVerticalScrollIndicator={false}
          style={styles.recordsScroll}
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
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  dismissArea: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
  },
  sheetWrap: { overflow: "hidden", borderRadius: radii.xl },
  glassSheet: {
    flex: 1,
    padding: spacing.xl,
  },
  paperSheet: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    padding: spacing.xl,
  },
  sheetContent: { flex: 1, minHeight: 0 },
  dragArea: { marginHorizontal: -spacing.xl, paddingHorizontal: spacing.xl },
  dragHandle: {
    width: 40,
    height: 5,
    alignSelf: "center",
    borderRadius: radii.pill,
    backgroundColor: "rgba(42,38,32,0.18)",
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
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
  recordsScroll: { flex: 1, minHeight: 0 },
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 15, fontWeight: "700" },
  emptyBody: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
});
