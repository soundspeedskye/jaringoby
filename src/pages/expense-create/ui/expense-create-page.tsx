import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { ChoiceChip } from "@/shared/ui/choice-chip";
import { EmptyState } from "@/shared/ui/empty-state";
import { ExpensePaymentFields } from "@/entities/expense/ui/expense-payment-fields";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { FormSection } from "@/shared/ui/form-section";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PlatformDateTimePicker } from "@/shared/ui/platform-date-time-picker";
import { PrimaryButton } from "@/shared/ui/primary-button";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import type { Period, PeriodMember } from "@/shared/api/types";
import { EXPENSE_EXCEPTION_REASON_MAX_LENGTH } from "@/shared/lib/domain/expenses";
import {
  createPeriodTimeline,
  effectiveDatesOfPeriod,
  getPeriodPhase,
} from "@/shared/lib/domain/period";
import { isExpenseMutationPhase } from "@/shared/lib/domain/permissions";
import { toSeoulLocalDate } from "@/shared/lib/domain/date-time";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type LocalDate,
} from "@/shared/model/types";
import { useDeadlineNow } from "@/shared/lib/use-deadline-now";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { usePeriodMembers } from "@/entities/period/api/use-periods";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import {
  pickSanitizedExpensePhoto,
  type ExpensePhotoSource,
} from "@/shared/services/expense-photo-picker";
import { formatSeoulDateTime } from "@/shared/lib/format";
import { createUuid } from "@/shared/lib/uuid";

const CATEGORY_ICONS: Record<
  ExpenseCategory,
  keyof typeof MaterialCommunityIcons.glyphMap
> = {
  점심: "food-outline",
  커피: "coffee-outline",
  간식: "cookie-outline",
  저녁: "food-turkey",
  필수품: "basket-outline",
  사치품: "diamond-stone",
};

export function ExpenseCreatePage() {
  const router = useRouter();
  const { addExpense } = useAppActions();
  const { activeRoom, currentPeriod, currentUser } = useCurrentRoom();
  const members = usePeriodMembers(currentPeriod?.id);
  const currentMember =
    currentPeriod && currentUser
      ? members.find((member) => member.userId === currentUser.id)
      : undefined;
  const timeline = useMemo(
    () =>
      currentPeriod ? createPeriodTimeline(currentPeriod.weekStart) : null,
    [currentPeriod],
  );
  const now = useDeadlineNow(
    timeline ? [timeline.S, timeline.E, timeline.C, timeline.F] : [],
    Boolean(timeline),
  );
  const [amountText, setAmountText] = useState("");
  const [usesPoints, setUsesPoints] = useState(false);
  const [pointAmountText, setPointAmountText] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("점심");
  const [isException, setIsException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [memo, setMemo] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [occurredAt, setOccurredAt] = useState(() =>
    chooseInitialOccurrence(currentPeriod, currentMember),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientRequestId] = useState(createUuid);

  if (!activeRoom || !currentPeriod || !currentMember) {
    return (
      <ModalFormScreen
        onBack={() => router.back()}
        testID="new-expense-screen"
        title="지출 기록"
      >
        <EmptyState
          action={
            <PrimaryButton
              label="홈으로 돌아가기"
              onPress={() => router.dismissTo("/")}
              variant="secondary"
            />
          }
          description="주차 지출은 이번 주차에 참여 중일 때만 사진과 함께 기록할 수 있어요."
          icon="calendar-remove-outline"
          title="참여 중인 주차가 없어요."
        />
      </ModalFormScreen>
    );
  }

  if (!timeline) return null;
  const phase = getPeriodPhase(timeline, now);
  const canMutate = isExpenseMutationPhase(phase);
  const effectiveDates = effectiveDatesOfPeriod(currentPeriod);

  const pickPhoto = async (source: ExpensePhotoSource) => {
    setFormError(null);
    try {
      const result = await pickSanitizedExpensePhoto(source);
      if (result.status === "permission-denied") {
        setFormError("카메라 권한을 허용해야 사진을 촬영할 수 있어요.");
      } else if (result.status === "selected") {
        setPhotoUri(result.uri);
      }
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "사진을 불러오지 못했어요.",
      );
    }
  };

  const submit = async () => {
    setFormError(null);
    const normalizedAmount = amountText.replace(/[^0-9]/gu, "");
    const amount = Number(normalizedAmount);
    if (!normalizedAmount || !Number.isSafeInteger(amount) || amount < 0) {
      setFormError("금액을 0원 이상의 정수로 입력해 주세요.");
      return;
    }
    const normalizedPointAmount = pointAmountText.replace(/[^0-9]/gu, "");
    const pointAmount = usesPoints ? Number(normalizedPointAmount) : 0;
    if (
      usesPoints &&
      (!normalizedPointAmount ||
        !Number.isSafeInteger(pointAmount) ||
        pointAmount < 1)
    ) {
      setFormError("포인트 사용 금액을 1원 이상의 정수로 입력해 주세요.");
      return;
    }
    if (!photoUri) {
      setFormError("챌린지 지출에는 사진이 정확히 1장 필요해요.");
      return;
    }
    if (memo.trim().length > 200) {
      setFormError("메모는 200자 이내로 입력해 주세요.");
      return;
    }
    const trimmedReason = exceptionReason.trim();
    if (isException && !trimmedReason) {
      setFormError("예외 사유를 입력해 주세요.");
      return;
    }
    if (trimmedReason.length > EXPENSE_EXCEPTION_REASON_MAX_LENGTH) {
      setFormError(
        `예외 사유는 ${EXPENSE_EXCEPTION_REASON_MAX_LENGTH}자 이내로 입력해 주세요.`,
      );
      return;
    }
    const occurredOn = toSeoulLocalDate(occurredAt);
    if (!effectiveDates.includes(occurredOn)) {
      setFormError("주말이나 공휴일 지출은 주차 한도에 넣을 수 없어요.");
      return;
    }
    // D3: 합류일 포함 — 같은 날 합류 전 시각의 지출도 유효 (day 단위 판정).
    if (occurredOn < currentMember.joinedDate) {
      setFormError("합류 전 지출은 주차에 소급 등록할 수 없어요.");
      return;
    }
    if (
      occurredAt.getTime() < timeline.S ||
      occurredAt.getTime() >= timeline.E
    ) {
      setFormError("이번 주차 기간 안에서 발생한 지출만 등록할 수 있어요.");
      return;
    }

    setSubmitting(true);
    try {
      const expense = await addExpense({
        periodId: currentPeriod.id,
        amount,
        pointAmount,
        category,
        memo: memo.trim(),
        photoUri,
        occurredAt: occurredAt.toISOString(),
        clientRequestId,
        exceptionReason: isException ? trimmedReason : undefined,
      });
      // rid: 오프라인 큐가 낙관적 ID를 서버 ID로 교체해도 상세 화면이
      // 멱등 키(clientRequestId)로 같은 지출을 계속 찾을 수 있게 한다.
      router.replace({
        pathname: "/expense/[id]",
        params: { id: expense.id, rid: expense.clientRequestId },
      });
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "지출을 저장하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalFormScreen
      footer={
        <PrimaryButton
          disabled={!canMutate}
          label="저장"
          loading={submitting}
          onPress={() => void submit()}
        />
      }
      onBack={() => router.back()}
      testID="new-expense-screen"
      title="지출 기록"
    >
      <View style={styles.roomChip}>
        <MaterialCommunityIcons
          color={palette.green}
          name="shield-check-outline"
          size={17}
        />
        <Text numberOfLines={1} style={styles.roomName}>
          {activeRoom.name} · {currentPeriod.weekIndex}주차
        </Text>
        <Text style={styles.phaseLabel}>
          {phase === "ADJUSTMENT" ? "보정 입력" : "주차 지출"}
        </Text>
      </View>

      {!canMutate ? (
        <NoticeBanner icon="lock-outline" style={styles.locked} tone="danger">
          {phase === "WAITING"
            ? "월요일에 주차가 시작되면 지출을 기록할 수 있어요."
            : "보정 마감이 지나 지출 입력이 잠겼어요."}
        </NoticeBanner>
      ) : null}

      <FormSection required style={styles.photoSection} title="지출 사진 1장">
        {photoUri ? (
          <View style={styles.photoFrame}>
            <Image
              accessibilityLabel="선택한 지출 사진"
              contentFit="contain"
              source={{ uri: photoUri }}
              style={styles.photo}
            />
            <Pressable
              accessibilityLabel="사진 제거"
              onPress={() => setPhotoUri(null)}
              style={styles.removePhoto}
            >
              <MaterialCommunityIcons
                color={palette.cream}
                name="close"
                size={18}
              />
            </Pressable>
          </View>
        ) : (
          <View style={styles.photoPlaceholder}>
            <MaterialCommunityIcons
              color={palette.greenSoft}
              name="image-plus"
              size={40}
            />
            <Text style={styles.photoPlaceholderTitle}>
              무엇에 썼는지 사진으로 남겨요.
            </Text>
          </View>
        )}
        <View style={styles.photoActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickPhoto("camera")}
            style={styles.photoButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="camera-outline"
              size={20}
            />
            <Text style={styles.photoButtonText}>카메라</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickPhoto("library")}
            style={styles.photoButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="image-multiple-outline"
              size={20}
            />
            <Text style={styles.photoButtonText}>
              {photoUri ? "사진 교체" : "앨범에서 선택"}
            </Text>
          </Pressable>
        </View>
      </FormSection>

      <ExpensePaymentFields
        amountPlaceholder="예: 12,000"
        amountText={amountText}
        onAmountChange={setAmountText}
        onPointAmountChange={setPointAmountText}
        onUsesPointsChange={setUsesPoints}
        pointAmountPlaceholder="예: 3,000"
        pointAmountText={pointAmountText}
        usesPoints={usesPoints}
      />

      <View style={styles.categorySection}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryTitle}>카테고리</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isException }}
            hitSlop={8}
            onPress={() => {
              setIsException((value) => !value);
              if (isException) setExceptionReason("");
            }}
            style={styles.exceptionToggle}
          >
            <View
              style={[styles.checkbox, isException && styles.checkboxChecked]}
            >
              {isException ? (
                <MaterialCommunityIcons
                  color={palette.cream}
                  name="check"
                  size={14}
                />
              ) : null}
            </View>
            <Text style={styles.exceptionLabel}>예외</Text>
          </Pressable>
          {isException ? (
            <TextInput
              accessibilityLabel="예외 사유"
              maxLength={EXPENSE_EXCEPTION_REASON_MAX_LENGTH}
              onChangeText={setExceptionReason}
              placeholder="사유"
              placeholderTextColor={palette.muted}
              style={styles.exceptionInput}
              value={exceptionReason}
            />
          ) : null}
        </View>
        <View
          accessibilityLabel="지출 카테고리 선택"
          accessibilityRole="radiogroup"
          style={styles.categories}
        >
          {EXPENSE_CATEGORIES.map((item) => (
            <ChoiceChip
              icon={CATEGORY_ICONS[item]}
              key={item}
              label={item}
              onPress={() => setCategory(item)}
              selected={item === category}
              style={styles.category}
            />
          ))}
        </View>
        {isException ? (
          <Text style={styles.exceptionHint}>
            나를 제외한 모든 멤버들의 승인이 필요합니다.
          </Text>
        ) : null}
      </View>

      <FormSection style={styles.timeSection} title="발생 일시">
        <OccurrenceDateTimePicker
          maximumDate={dateAtSeoulNoon(currentPeriod.weekEnd)}
          minimumDate={dateAtSeoulNoon(
            currentMember.joinedDate > currentPeriod.weekStart
              ? currentMember.joinedDate
              : currentPeriod.weekStart,
          )}
          onChange={setOccurredAt}
          value={occurredAt}
        />
      </FormSection>

      <Field
        label="메모"
        maxLength={200}
        multiline
        onChangeText={setMemo}
        placeholder="함께 보는 멤버에게 남길 한마디"
        style={styles.memoInput}
        value={memo}
      />
      <Text style={styles.counter}>{memo.length}/200</Text>

      <FormMessage message={formError} style={styles.formMessage} />
    </ModalFormScreen>
  );
}

function OccurrenceDateTimePicker({
  maximumDate,
  minimumDate,
  value,
  onChange,
}: {
  maximumDate?: Date;
  minimumDate?: Date;
  value: Date;
  onChange: (value: Date) => void;
}) {
  return (
    <PlatformDateTimePicker
      iosModalTitle="발생 일시 변경"
      iosPresentation="modal"
      maximumDate={maximumDate}
      minimumDate={minimumDate}
      mode="datetime"
      onChange={onChange}
      renderTrigger={(open) => (
        <Pressable
          accessibilityLabel={`발생 일시 ${formatSeoulDateTime(value)}, 변경`}
          accessibilityRole="button"
          onPress={open}
          style={({ pressed }) => [
            styles.timeCard,
            pressed && styles.timeCardPressed,
          ]}
        >
          <Text style={styles.timeValue}>{formatSeoulDateTime(value)}</Text>
          <MaterialCommunityIcons
            color={palette.green}
            name="chevron-right"
            size={22}
          />
        </Pressable>
      )}
      renderWeb={() => (
        <View style={styles.timeCard}>
          <Text style={styles.timeValue}>{formatSeoulDateTime(value)}</Text>
        </View>
      )}
      value={value}
    />
  );
}

function chooseInitialOccurrence(
  period: Period | null,
  member: PeriodMember | undefined,
  now = Date.now(),
): Date {
  if (!period) return new Date(now);
  const joinedDate = member?.joinedDate;
  const effectiveDates = effectiveDatesOfPeriod(period).filter(
    (date) => !joinedDate || date >= joinedDate,
  );
  const today = toSeoulLocalDate(now);
  if (effectiveDates.includes(today)) return new Date(now);
  const fallback = effectiveDates.at(-1) ?? period.weekEnd;
  return new Date(`${fallback}T12:00:00+09:00`);
}

function dateAtSeoulNoon(date: LocalDate): Date {
  return new Date(`${date}T12:00:00+09:00`);
}

const styles = StyleSheet.create({
  roomChip: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(47,113,93,0.10)",
  },
  roomName: {
    flex: 1,
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  phaseLabel: {
    color: palette.coralText,
    fontFamily: fonts.handBold,
    fontSize: 10,
    fontWeight: "700",
  },
  locked: { marginTop: spacing.md },
  photoSection: { marginVertical: spacing.xl },
  photoFrame: {
    overflow: "hidden",
    position: "relative",
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: radii.lg,
    backgroundColor: palette.line,
  },
  photo: { width: "100%", height: "100%" },
  removePhoto: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "rgba(52,49,40,0.72)",
  },
  photoPlaceholder: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.greenSoft,
    borderRadius: radii.lg,
    backgroundColor: palette.paper,
  },
  photoPlaceholderTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
    marginTop: spacing.sm,
  },
  photoActions: { flexDirection: "row", gap: spacing.sm },
  photoButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: palette.green,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  photoButtonText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.green,
    borderRadius: 6,
    backgroundColor: palette.paper,
  },
  checkboxChecked: { backgroundColor: palette.green },
  categorySection: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // 체크 시 인풋(높이 34)이 생겨도 헤더 높이를 고정해 칩이 밀리지 않게 한다.
    minHeight: 34,
  },
  categoryTitle: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 16,
    fontWeight: "700",
  },
  exceptionToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: spacing.sm,
  },
  exceptionLabel: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  exceptionInput: {
    flex: 1,
    minWidth: 0,
    height: 34,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: palette.green,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 13,
  },
  exceptionHint: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    lineHeight: 17,
  },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  category: {
    width: "31%",
    minHeight: 68,
    borderRadius: radii.md,
  },
  timeSection: { marginBottom: spacing.xl },
  timeCard: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  timeCardPressed: { opacity: 0.8 },
  timeValue: {
    color: palette.ink,
    fontFamily: fonts.number,
    fontSize: 17,
    fontWeight: "700",
    ...tabularNums,
  },
  memoInput: { minHeight: 92, textAlignVertical: "top" },
  counter: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    textAlign: "right",
    marginTop: 4,
    marginBottom: 4,
    ...tabularNums,
  },
  formMessage: { marginBottom: spacing.md },
});
