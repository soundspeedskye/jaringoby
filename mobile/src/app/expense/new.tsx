import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ModalFormScreen } from "@/components/layout/modal-form-screen";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormSection } from "@/components/ui/form-section";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PlatformDateTimePicker } from "@/components/ui/platform-date-time-picker";
import { PrimaryButton } from "@/components/ui/primary-button";
import { palette, radii, spacing } from "@/constants/design";
import type { Period, PeriodMember } from "@/data/types";
import {
  addLocalDays,
  createPeriodTimeline,
  EXPENSE_CATEGORIES,
  getPeriodPhase,
  toSeoulLocalDate,
  type ExpenseCategory,
  type LocalDate,
} from "@/domain";
import { useAppActions, useAppData } from "@/providers/app-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { createUuid } from "@/utils/uuid";

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

export default function NewExpenseScreen() {
  const router = useRouter();
  const { addExpense } = useAppActions();
  const { activeRoom, currentPeriod, currentUser, getMembers } = useAppData();
  const currentMember =
    currentPeriod && currentUser
      ? getMembers(currentPeriod.id).find(
          (member) => member.userId === currentUser.id,
        )
      : undefined;
  const timeline = useMemo(
    () => (currentPeriod ? createPeriodTimeline(currentPeriod.weekStart) : null),
    [currentPeriod],
  );
  const now = useDeadlineNow(
    timeline ? [timeline.S, timeline.E, timeline.C, timeline.F] : [],
    Boolean(timeline),
  );
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("점심");
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
              onPress={() => router.replace("/")}
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
  const canMutate = phase === "ACTIVE" || phase === "ADJUSTMENT";
  const effectiveDates = enumerateEffectiveDates(currentPeriod);

  const pickPhoto = async (source: "camera" | "library") => {
    setFormError(null);
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setFormError("카메라 권한을 허용해야 사진을 촬영할 수 있어요.");
          return;
        }
      } else {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setFormError(
            "사진 보관함 권한을 허용해야 이미지를 선택할 수 있어요.",
          );
          return;
        }
      }

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              allowsMultipleSelection: false,
              exif: false,
              mediaTypes: ["images"],
              quality: 0.78,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              allowsMultipleSelection: false,
              exif: false,
              mediaTypes: ["images"],
              quality: 0.78,
            });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const actions: ImageManipulator.Action[] =
          asset.width > 1_600 ? [{ resize: { width: 1_600 } }] : [];
        // A newly encoded file drops the original EXIF block (including GPS data)
        // before it is shown in the preview or handed to the repository upload path.
        const sanitized = await ImageManipulator.manipulateAsync(
          asset.uri,
          actions,
          {
            compress: 0.8,
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );
        setPhotoUri(sanitized.uri);
      }
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "사진을 불러오지 못했어요.",
      );
    }
  };

  const submit = async () => {
    setFormError(null);
    const amount = Number(amountText.replace(/[^0-9]/gu, ""));
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setFormError("금액을 1원 이상의 정수로 입력해 주세요.");
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
        category,
        memo: memo.trim(),
        photoUri,
        occurredAt: occurredAt.toISOString(),
        clientRequestId,
      });
      router.replace(`/expense/${expense.id}`);
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
          label="사진과 함께 지출 저장"
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
              contentFit="cover"
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

      <Field
        keyboardType="number-pad"
        label="금액"
        onChangeText={setAmountText}
        placeholder="예: 12000"
        value={amountText}
      />

      <FormSection style={styles.categorySection} title="카테고리">
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
      </FormSection>

      <FormSection style={styles.timeSection} title="발생 일시">
        <Text style={styles.timeValue}>{formatSeoulDateTime(occurredAt)}</Text>
        <View style={styles.timeButtons}>
          <OccurrencePicker
            label="날짜 변경"
            // D1: 주차는 월~금이라 범위 제한만으로 주말이 비활성화된다.
            maximumDate={dateAtSeoulNoon(currentPeriod.weekEnd)}
            minimumDate={dateAtSeoulNoon(
              currentMember.joinedDate > currentPeriod.weekStart
                ? currentMember.joinedDate
                : currentPeriod.weekStart,
            )}
            mode="date"
            onChange={setOccurredAt}
            value={occurredAt}
          />
          <OccurrencePicker
            label="시간 변경"
            mode="time"
            onChange={setOccurredAt}
            value={occurredAt}
          />
        </View>
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

function OccurrencePicker({
  label,
  maximumDate,
  minimumDate,
  mode,
  value,
  onChange,
}: {
  label: string;
  maximumDate?: Date;
  minimumDate?: Date;
  mode: "date" | "time";
  value: Date;
  onChange: (value: Date) => void;
}) {
  return (
    <PlatformDateTimePicker
      maximumDate={maximumDate}
      minimumDate={minimumDate}
      mode={mode}
      onChange={onChange}
      renderTrigger={(open) => (
        <View>
          <Pressable
            accessibilityRole="button"
            onPress={open}
            style={styles.timeButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name={mode === "date" ? "calendar-outline" : "clock-outline"}
              size={17}
            />
            <Text style={styles.timeButtonText}>{label}</Text>
          </Pressable>
        </View>
      )}
      renderWeb={() => <Text style={styles.webPickerHint}>모바일 앱에서 {label}</Text>}
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
  const effectiveDates = enumerateEffectiveDates(period).filter(
    (date) => !joinedDate || date >= joinedDate,
  );
  const today = toSeoulLocalDate(now);
  if (effectiveDates.includes(today)) return new Date(now);
  const fallback = effectiveDates.at(-1) ?? period.weekEnd;
  return new Date(`${fallback}T12:00:00+09:00`);
}

/** 주차의 월~금 중 공휴일을 뺀 날짜 목록. */
function enumerateEffectiveDates(period: Period): LocalDate[] {
  return Array.from({ length: period.selectedDayCount }, (_, index) =>
    addLocalDays(period.weekStart, index),
  ).filter((date) => !period.holidayDates.includes(date));
}

function dateAtSeoulNoon(date: LocalDate): Date {
  return new Date(`${date}T12:00:00+09:00`);
}

function formatSeoulDateTime(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
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
  roomName: { flex: 1, color: palette.green, fontSize: 13, fontWeight: "700" },
  phaseLabel: { color: palette.coralText, fontSize: 10, fontWeight: "700" },
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
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  photoPlaceholderTitle: {
    color: palette.ink,
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
    backgroundColor: "rgba(255,255,255,0.46)",
  },
  photoButtonText: { color: palette.green, fontSize: 12, fontWeight: "700" },
  categorySection: { marginVertical: spacing.xl },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  category: {
    width: "31%",
    minHeight: 68,
    borderRadius: radii.md,
  },
  timeSection: { marginBottom: spacing.xl },
  timeValue: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  timeButtons: { flexDirection: "row", gap: spacing.sm },
  timeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.green,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  timeButtonText: { color: palette.green, fontSize: 11, fontWeight: "600" },
  webPickerHint: { color: palette.muted, fontSize: 11 },
  memoInput: { minHeight: 92, textAlignVertical: "top" },
  counter: {
    color: palette.muted,
    fontSize: 10,
    textAlign: "right",
    marginTop: 4,
    marginBottom: 4,
  },
  formMessage: { marginBottom: spacing.md },
});
