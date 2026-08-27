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
  /** 시트 위쪽으로 남겨둘 화면 높이(px). 히어로 카드 아래를 여는 쪽에서 재서 넘긴다. */
  topOffset: number | null;
  onClose: () => void;
  /** 항목을 누르면 시트를 닫은 뒤 호출된다. entities는 라우터를 직접 쓰지 않는다. */
  onSelectExpense?: (expenseId: string, clientRequestId?: string) => void;
};

const SHEET_MIN_HEIGHT = 360;
// 히어로 카드 아래로 둘 숨 쉴 틈.
const SHEET_TOP_GAP = 12;
// 히어로 카드 위치를 재지 못했을 때 쓰는 대략치.
const SHEET_FALLBACK_RATIO = 0.55;
const DISMISS_DISTANCE = 84;
const DISMISS_VELOCITY = 900;
const SHEET_ANIMATION = {
  duration: 280,
  easing: Easing.out(Easing.cubic),
};

/**
 * 홈의 날짜칩에서 열리는 읽기 전용 모달 바텀시트다. 날짜칩이 있는 히어로 카드는
 * 그대로 보이도록 그 아래에 붙어, 화면 아래까지 도킹한다. 열린 동안에는 뒤
 * 화면을 조작할 수 없다.
 */
export const DailyExpensePeekSheet = memo(function DailyExpensePeekSheet({
  date,
  expenses,
  profilesById,
  topOffset,
  onClose,
  onSelectExpense,
}: DailyExpensePeekSheetProps) {
  const insets = useSafeAreaInsets();
  const liquidGlass = useLiquidGlass();
  const { height: windowHeight } = useWindowDimensions();
  const sheetOffset = useSharedValue(SHEET_MIN_HEIGHT);
  const panStartOffset = useSharedValue(0);
  const isClosing = useSharedValue(false);
  // 히어로 카드는 그대로 보이고 그 아래만 덮는다. 카드 아래 끝을 열 때 재서
  // 받으므로, 못 받았을 때만 대략치로 떨어진다.
  const sheetTop = (topOffset ?? Math.floor(windowHeight * SHEET_FALLBACK_RATIO)) + SHEET_TOP_GAP;
  const sheetHeight = Math.max(
    // 내용이 없는 날의 빈 상태가 찌그러지지 않을 만큼은 지킨다.
    SHEET_MIN_HEIGHT,
    Math.min(
      windowHeight - sheetTop,
      // 어떤 경우에도 상단 안전 영역까지 올라오지 않는다.
      windowHeight - insets.top,
    ),
  );
  // 시트 표면이 화면 맨 아래까지 닿아야 해서 이 여백은 래퍼가 아니라 표면 안쪽에 준다.
  // 래퍼에 주면 그만큼 배경 없는 띠가 남아 뒤의 홈 화면이 그대로 드러난다.
  const surfacePaddingBottom = Math.max(insets.bottom, spacing.lg);
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

  // 모달이 떠 있는 채로 화면을 밀면 iOS에서 새 화면이 모달 아래에 깔린다.
  // 그래서 항목을 골라도 닫힘 애니메이션이 끝난 뒤에야 이동시킨다.
  const finishClose = useCallback((expenseId?: string, clientRequestId?: string) => {
    onClose();
    if (expenseId) onSelectExpense?.(expenseId, clientRequestId);
  }, [onClose, onSelectExpense]);

  const dismissWith = useCallback((expenseId?: string, clientRequestId?: string) => {
    if (isClosing.get()) return;
    isClosing.set(true);
    sheetOffset.set(withTiming(
      sheetHeight,
      SHEET_ANIMATION,
      (finished) => {
        if (finished) runOnJS(finishClose)(expenseId, clientRequestId);
      },
    ));
  }, [finishClose, isClosing, sheetHeight, sheetOffset]);

  const dismiss = useCallback(() => dismissWith(), [dismissWith]);
  const selectExpense = useCallback(
    (expense: Expense) => dismissWith(expense.id, expense.clientRequestId),
    [dismissWith],
  );

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
                { height: sheetHeight },
                sheetAnimatedStyle,
              ]}
            >
              {liquidGlass ? (
                <GlassView
                  glassEffectStyle="regular"
                  style={[styles.glassSheet, { paddingBottom: surfacePaddingBottom }]}
                  tintColor={glass.tint}
                >
                  <SheetContents
                    date={date}
                    dayExpenses={dayExpenses}
                    onClose={dismiss}
                    onSelectExpense={onSelectExpense ? selectExpense : undefined}
                    panGesture={panGesture}
                    profilesById={profilesById}
                    total={total}
                  />
                </GlassView>
              ) : (
                <View style={[styles.paperSheet, { paddingBottom: surfacePaddingBottom }]}>
                  <SheetContents
                    date={date}
                    dayExpenses={dayExpenses}
                    onClose={dismiss}
                    onSelectExpense={onSelectExpense ? selectExpense : undefined}
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
  onSelectExpense,
  panGesture,
  profilesById,
  total,
}: {
  date: string;
  dayExpenses: readonly Expense[];
  onClose: () => void;
  onSelectExpense?: (expense: Expense) => void;
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
            const nickname = profile?.nickname ?? "알 수 없음";
            const title = expense.memo || expense.category;
            return (
              <Pressable
                accessibilityHint={onSelectExpense ? "지출 상세를 엽니다" : undefined}
                accessibilityLabel={`${nickname}님의 ${expense.category} ${formatWon(expense.amount)}, ${title}`}
                accessibilityRole={onSelectExpense ? "button" : undefined}
                disabled={!onSelectExpense}
                key={expense.id}
                onPress={() => onSelectExpense?.(expense)}
                style={({ pressed }) => [
                  styles.record,
                  pressed && onSelectExpense && styles.recordPressed,
                ]}
              >
                <AnimalAvatar
                  photoUri={profile?.avatarUri}
                  size={34}
                  value={profile?.avatar ?? ""}
                />
                <View style={styles.recordCopy}>
                  <Text numberOfLines={1} style={styles.recordTitle}>
                    {title}
                  </Text>
                  <Text style={styles.recordMeta}>
                    {nickname} · {expense.category} · {formatTimeLabel(expense.occurredAt)}
                  </Text>
                </View>
                <Text style={styles.amount}>{formatWon(expense.amount)}</Text>
              </Pressable>
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
  sheetWrap: {
    overflow: "hidden",
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  glassSheet: {
    flex: 1,
    padding: spacing.xl,
  },
  paperSheet: {
    flex: 1,
    // 화면 아래에 도킹된 종이라 위쪽 경계선만 남긴다.
    borderTopWidth: 1,
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
  recordPressed: { opacity: 0.72 },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: "700" },
  recordMeta: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: 3 },
  amount: { color: palette.coralText, fontFamily: fonts.number, fontSize: 14, fontWeight: "800", ...tabularNums },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 15, fontWeight: "700" },
  emptyBody: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
});
