import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ModalFormScreen } from "@/components/layout/modal-form-screen";
import { ActionChip } from "@/components/ui/choice-chip";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormSection } from "@/components/ui/form-section";
import { GlassSurface } from "@/components/ui/glass-surface";
import { KeyValueRow } from "@/components/ui/key-value-row";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PlatformDateTimePicker } from "@/components/ui/platform-date-time-picker";
import { PrimaryButton } from "@/components/ui/primary-button";
import { palette, radii, spacing } from "@/constants/design";
import {
  addLocalDays,
  calculateAppliedLimit,
  parseLocalDate,
  startOfSeoulDate,
  toSeoulLocalDate,
  type LocalDate,
} from "@/domain";
import { useAppActions } from "@/providers/app-provider";
import { formatWon } from "@/utils/format";
import { createUuid } from "@/utils/uuid";

const DAY_MS = 24 * 60 * 60 * 1_000;

// Local demo snapshot. The production repository replaces this with the versioned
// server-side Korean holiday calendar while preserving these dates in the room.
const KNOWN_KR_HOLIDAYS: Readonly<Record<string, string>> = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "삼일절 대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-08-17": "광복절 대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-09-28": "추석 대체공휴일",
  "2026-10-03": "개천절",
  "2026-10-05": "개천절 대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "기독탄신일",
};

export default function CreateChallengeScreen() {
  const router = useRouter();
  const { createChallenge } = useAppActions();
  const [now] = useState(() => Date.now());
  const today = toSeoulLocalDate(now);
  const [name, setName] = useState("5일 지출 챌린지");
  const [startDate, setStartDate] = useState<LocalDate>(today);
  const [endDate, setEndDate] = useState<LocalDate>(addLocalDays(today, 4));
  const [amountText, setAmountText] = useState("50,000");
  const [capacityText, setCapacityText] = useState("4");
  const [confirmedImmutable, setConfirmedImmutable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientRequestId] = useState(createUuid);

  const baseLimit = parseKrw(amountText);
  const capacity = Number(capacityText);
  const calendarDays = useMemo(
    () => enumerateDates(startDate, endDate),
    [endDate, startDate],
  );
  const selectedDates = calendarDays;
  const holidayDates = useMemo(
    () => selectedDates.filter((date) => Boolean(KNOWN_KR_HOLIDAYS[date])),
    [selectedDates],
  );
  const effectiveDays = selectedDates.length - holidayDates.length;
  const previewLimit = useMemo(() => {
    if (
      !Number.isSafeInteger(baseLimit) ||
      baseLimit < 1 ||
      !selectedDates.length ||
      effectiveDays < 1
    )
      return 0;
    return calculateAppliedLimit({
      baseAmount: baseLimit,
      totalSelectedDays: selectedDates.length,
      remainingEffectiveDays: effectiveDays,
    });
  }, [baseLimit, effectiveDays, selectedDates.length]);

  const applyPreset = (preset: "TODAY" | "NEXT_WEEKDAY" | "SEVEN_DAYS") => {
    if (preset === "TODAY") {
      setStartDate(today);
      setEndDate(today);
      return;
    }
    if (preset === "SEVEN_DAYS") {
      setStartDate(today);
      setEndDate(addLocalDays(today, 6));
      return;
    }
    let monday = addLocalDays(today, 1);
    while (dayOfWeek(monday) !== 1) monday = addLocalDays(monday, 1);
    setStartDate(monday);
    setEndDate(addLocalDays(monday, 4));
  };

  const changeStartDate = (date: LocalDate) => {
    setStartDate(date);
    if (startOfSeoulDate(endDate) < startOfSeoulDate(date)) setEndDate(date);
  };

  const submit = async () => {
    setFormError(null);
    const error = validate({
      name,
      startDate,
      endDate,
      baseLimit,
      capacity,
      selectedDates,
      effectiveDays,
      confirmedImmutable,
    });
    if (error) {
      setFormError(error);
      return;
    }

    setSubmitting(true);
    try {
      await createChallenge({
        name: name.trim(),
        startDate,
        endDate,
        selectedDates,
        holidayDates,
        baseLimit,
        capacity,
        clientRequestId,
      });
      router.replace("/");
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "챌린지를 만들지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalFormScreen
      footer={
        <PrimaryButton
          label="이 조건으로 챌린지 만들기"
          loading={submitting}
          onPress={() => void submit()}
        />
      }
      headerBottomSpacing="xl"
      onBack={() => router.back()}
      testID="create-challenge-screen"
      title="챌린지 만들기"
    >
      <Field
        autoFocus
        label="챌린지 이름"
        maxLength={32}
        onChangeText={setName}
        placeholder="예: 평일 5만원 쓰기"
        value={name}
      />

      <FormSection
        hint="시작일과 종료일을 포함해 최대 31일까지 선택할 수 있어요."
        style={styles.section}
        title="기간"
      >
        <View style={styles.presets}>
          <ActionChip label="오늘" onPress={() => applyPreset("TODAY")} />
          <ActionChip
            label="다음 평일"
            onPress={() => applyPreset("NEXT_WEEKDAY")}
          />
          <ActionChip label="7일" onPress={() => applyPreset("SEVEN_DAYS")} />
        </View>
        <View style={styles.dateRow}>
          <DateSelector
            label="시작일"
            minimumDate={today}
            onChange={changeStartDate}
            value={startDate}
          />
          <MaterialCommunityIcons
            color={palette.muted}
            name="arrow-right"
            size={18}
            style={styles.dateArrow}
          />
          <DateSelector
            label="종료일"
            minimumDate={startDate}
            onChange={setEndDate}
            value={endDate}
          />
        </View>
      </FormSection>

      <NoticeBanner icon="calendar-range-outline" style={styles.selectionNotice}>
        시작일부터 종료일까지 주말을 포함한 연속 {selectedDates.length}일이
        선택일로 고정돼요. 공휴일만 자동 제외됩니다.
      </NoticeBanner>

      <View style={styles.amountRow}>
        <View style={styles.flexField}>
          <Field
            keyboardType="number-pad"
            label="기준금액"
            onChangeText={(value) => setAmountText(formatKrwInput(value))}
            placeholder="50,000"
            value={amountText}
          />
        </View>
        <View style={styles.capacityField}>
          <Field
            hint="최대 10명"
            keyboardType="number-pad"
            label="최초 정원"
            maxLength={2}
            onChangeText={setCapacityText}
            value={capacityText}
          />
        </View>
      </View>

      <GlassSurface
        style={styles.preview}
        testID="challenge-calculation-preview"
      >
        <View style={styles.previewHeader}>
          <View>
            <Text style={styles.previewKicker}>CREATION SNAPSHOT</Text>
            <Text style={styles.previewTitle}>예상 적용한도</Text>
          </View>
          <Text style={styles.previewValue}>{formatWon(previewLimit)}</Text>
        </View>
        <View style={styles.divider} />
        <KeyValueRow label="전체 선택일" value={`${selectedDates.length}일`} />
        <KeyValueRow
          label="대한민국 공휴일 제외"
          value={`${holidayDates.length}일`}
        />
        <KeyValueRow
          label="유효 챌린지"
          value={`${Math.max(0, effectiveDays)}일`}
        />
        <KeyValueRow
          label="계산식"
          value={`${formatWon(baseLimit || 0, false)} × ${Math.max(0, effectiveDays)} ÷ ${selectedDates.length || 0}`}
        />
        {holidayDates.length ? (
          <View style={styles.holidayBox}>
            <Text style={styles.holidayTitle}>고정될 공휴일 스냅샷</Text>
            {holidayDates.map((date) => (
              <Text key={date} style={styles.holidayText}>
                {date} · {KNOWN_KR_HOLIDAYS[date]}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.noHoliday}>
            선택일에 포함된 대한민국 공휴일이 없어요.
          </Text>
        )}
      </GlassSurface>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmedImmutable }}
        onPress={() => setConfirmedImmutable((value) => !value)}
        style={styles.confirmation}
      >
        <View
          style={[
            styles.checkbox,
            confirmedImmutable && styles.checkboxChecked,
          ]}
        >
          {confirmedImmutable ? (
            <MaterialCommunityIcons
              color={palette.cream}
              name="check"
              size={15}
            />
          ) : null}
        </View>
        <Text style={styles.confirmationText}>
          방을 만들면 기간과 기준금액은 방을 삭제하기 전까지 변경할 수 없음을
          확인했어요.
        </Text>
      </Pressable>

      <FormMessage message={formError} style={styles.formMessage} />
    </ModalFormScreen>
  );
}

function DateSelector({
  label,
  value,
  minimumDate,
  onChange,
}: {
  label: string;
  value: LocalDate;
  minimumDate?: LocalDate;
  onChange: (value: LocalDate) => void;
}) {
  return (
    <PlatformDateTimePicker
      iosModalTitle={`${label} 선택`}
      iosPresentation="modal"
      minimumDate={minimumDate ? dateFromLocal(minimumDate) : undefined}
      mode="date"
      onChange={(date) => onChange(toSeoulLocalDate(date))}
      renderTrigger={(open) => (
        <View style={styles.dateSelector}>
          <Text style={styles.dateLabel}>{label}</Text>
          <Pressable onPress={open} style={styles.dateButton}>
            <MaterialCommunityIcons
              color={palette.green}
              name="calendar-blank-outline"
              size={18}
            />
            <Text style={styles.dateValue}>{value}</Text>
          </Pressable>
        </View>
      )}
      renderWeb={() => (
        <View style={styles.flexField}>
          <Field
            defaultValue={value}
            key={value}
            label={label}
            onChangeText={(text) => {
              if (!/^\d{4}-\d{2}-\d{2}$/u.test(text)) return;
              try {
                parseLocalDate(text);
                onChange(text as LocalDate);
              } catch {
                // Keep the last valid date while the user corrects the field.
              }
            }}
            placeholder="YYYY-MM-DD"
          />
        </View>
      )}
      value={dateFromLocal(value)}
    />
  );
}

function parseKrw(value: string): number {
  const normalized = value.replace(/[^0-9]/gu, "");
  return normalized ? Number(normalized) : 0;
}

function formatKrwInput(value: string): string {
  const digits = value.replace(/[^0-9]/gu, "");
  if (!digits) return "";
  const normalized = digits.replace(/^0+(?=\d)/u, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

function enumerateDates(startDate: LocalDate, endDate: LocalDate): LocalDate[] {
  const duration =
    Math.floor(
      (startOfSeoulDate(endDate) - startOfSeoulDate(startDate)) / DAY_MS,
    ) + 1;
  if (!Number.isInteger(duration) || duration < 1 || duration > 31) return [];
  return Array.from({ length: duration }, (_, index) =>
    addLocalDays(startDate, index),
  );
}

function dayOfWeek(date: LocalDate): number {
  return new Date(startOfSeoulDate(date) + 9 * 60 * 60 * 1_000).getUTCDay();
}

function dateFromLocal(date: LocalDate): Date {
  return new Date(`${date}T12:00:00+09:00`);
}

function validate(input: {
  name: string;
  startDate: LocalDate;
  endDate: LocalDate;
  baseLimit: number;
  capacity: number;
  selectedDates: LocalDate[];
  effectiveDays: number;
  confirmedImmutable: boolean;
}): string | null {
  if (!input.name.trim()) return "챌린지 이름을 입력해 주세요.";
  const duration =
    (startOfSeoulDate(input.endDate) - startOfSeoulDate(input.startDate)) /
      DAY_MS +
    1;
  if (!Number.isInteger(duration) || duration < 1 || duration > 31)
    return "기간은 시작일을 포함해 1~31일이어야 해요.";
  if (!input.selectedDates.length)
    return "1~31일 사이의 챌린지 기간을 선택해 주세요.";
  if (input.effectiveDays < 1)
    return "선택일이 모두 공휴일이라 방을 만들 수 없어요.";
  if (!Number.isSafeInteger(input.baseLimit) || input.baseLimit < 1)
    return "기준금액을 1원 이상의 정수로 입력해 주세요.";
  if (
    !Number.isInteger(input.capacity) ||
    input.capacity < 1 ||
    input.capacity > 10
  )
    return "정원은 방장을 포함해 1~10명으로 입력해 주세요.";
  if (!input.confirmedImmutable)
    return "기간과 기준금액이 고정된다는 내용을 확인해 주세요.";
  return null;
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  presets: { flexDirection: "row", gap: spacing.sm },
  dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dateArrow: { transform: [{ translateY: spacing.sm }] },
  dateSelector: { flex: 1, gap: spacing.sm },
  dateLabel: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  dateButton: {
    minHeight: 52,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  dateValue: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  selectionNotice: { marginTop: spacing.md },
  amountRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-start",
    marginTop: spacing.xl,
  },
  flexField: { flex: 1 },
  capacityField: { width: 120 },
  preview: {
    padding: spacing.xl,
    marginVertical: spacing.xl,
    backgroundColor: "rgba(255,253,247,0.62)",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  previewKicker: {
    color: palette.coralText,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  previewTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 3,
  },
  previewValue: { color: palette.green, fontSize: 25, fontWeight: "800" },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
    marginVertical: spacing.md,
  },
  holidayBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(240,185,46,0.12)",
  },
  holidayTitle: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
  },
  holidayText: { color: palette.muted, fontSize: 11, lineHeight: 18 },
  noHoliday: { color: palette.muted, fontSize: 11, marginTop: spacing.md },
  confirmation: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: "rgba(233,135,98,0.10)",
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 7,
    borderWidth: 1,
    borderColor: palette.coral,
    backgroundColor: palette.paper,
  },
  checkboxChecked: { backgroundColor: palette.coral },
  confirmationText: {
    flex: 1,
    color: palette.ink,
    fontSize: 12,
    lineHeight: 19,
  },
  formMessage: { marginBottom: spacing.md },
});
