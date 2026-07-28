import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ModalFormScreen } from "@/components/layout/modal-form-screen";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { GlassSurface } from "@/components/ui/glass-surface";
import { KeyValueRow } from "@/components/ui/key-value-row";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PrimaryButton } from "@/components/ui/primary-button";
import { palette, radii, spacing } from "@/constants/design";
import {
  createKoreanHolidaySnapshot,
  createPeriodMemberPlan,
  createWeekdayCalendar,
  DEFAULT_MAX_ACTIVE_MEMBERS,
  isWeekend,
  isValidRoomCapacity,
  isValidRoomName,
  resolveFirstWeekStart,
  ROOM_NAME_MAX_CHARACTERS,
  toSeoulLocalDate,
} from "@/domain";
import { useAppActions } from "@/providers/app-actions-provider";
import { formatWon } from "@/utils/format";
import { createUuid } from "@/utils/uuid";

// 공휴일은 서버(현재 공휴일 데이터셋)가 확정한다. 미리보기는 공휴일 제외 전
// 기준이며, 실제 한도는 방 생성 응답의 주차 정보로 다시 표시된다.
const EMPTY_HOLIDAYS = createKoreanHolidaySnapshot({
  version: "preview-empty",
  capturedAt: "2026-01-01T00:00:00+09:00",
  dates: [],
});

export default function CreateRoomScreen() {
  const router = useRouter();
  const { createRoom } = useAppActions();
  const [now] = useState(() => Date.now());
  const today = toSeoulLocalDate(now);
  const [name, setName] = useState("평일 5만원 지키기");
  const [amountText, setAmountText] = useState("50,000");
  const [capacityText, setCapacityText] = useState("4");
  const [confirmedImmutable, setConfirmedImmutable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientRequestId] = useState(createUuid);

  const baseAmount = parseKrw(amountText);
  const capacity = Number(capacityText);
  const weekendCreation = isWeekend(today);
  const firstWeekStart = useMemo(() => resolveFirstWeekStart(today), [today]);

  // D6: 평일 생성이면 오늘부터 일할, 주말 생성이면 다음 주 월요일 full 주차.
  const plan = useMemo(() => {
    if (!Number.isSafeInteger(baseAmount) || baseAmount < 1) return null;
    return createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: firstWeekStart,
        holidaySnapshot: EMPTY_HOLIDAYS,
      }),
      joinedOn: today,
      baseAmount,
    });
  }, [baseAmount, firstWeekStart, today]);

  const submit = async () => {
    setFormError(null);
    const error = validate({ name, baseAmount, capacity, confirmedImmutable });
    if (error) {
      setFormError(error);
      return;
    }

    setSubmitting(true);
    try {
      await createRoom({
        name: name.trim(),
        baseAmount,
        capacity,
        clientRequestId,
      });
      router.replace("/");
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "방을 만들지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalFormScreen
      footer={
        <PrimaryButton
          label="이 조건으로 방 만들기"
          loading={submitting}
          onPress={() => void submit()}
        />
      }
      headerBottomSpacing="xl"
      onBack={() => router.back()}
      testID="create-room-screen"
      title="방 만들기"
    >
      <Field
        autoFocus
        label="방 이름"
        maxLength={ROOM_NAME_MAX_CHARACTERS}
        onChangeText={setName}
        placeholder="예: 평일 5만원 지키기"
        value={name}
      />

      <NoticeBanner icon="calendar-sync-outline" style={styles.selectionNotice}>
        챌린지는 매주 월요일부터 금요일까지 자동으로 열려요. 주말은 쉬고,
        공휴일은 한도 계산에서 자동 제외됩니다.
      </NoticeBanner>

      <View style={styles.amountRow}>
        <View style={styles.flexField}>
          <Field
            hint="매주 같은 금액으로 반복돼요"
            keyboardType="number-pad"
            label="주당 기준금액"
            onChangeText={(value) => setAmountText(formatKrwInput(value))}
            placeholder="50,000"
            value={amountText}
          />
        </View>
        <View style={styles.capacityField}>
          <Field
            hint={`최대 ${DEFAULT_MAX_ACTIVE_MEMBERS}명`}
            keyboardType="number-pad"
            label="최초 정원"
            maxLength={2}
            onChangeText={setCapacityText}
            value={capacityText}
          />
        </View>
      </View>

      <GlassSurface style={styles.preview} testID="room-calculation-preview">
        <View style={styles.previewHeader}>
          <View>
            <Text style={styles.previewKicker}>FIRST WEEK</Text>
            <Text style={styles.previewTitle}>
              {weekendCreation ? "다음 주 월요일 시작" : "이번 주, 오늘부터 시작"}
            </Text>
          </View>
          <Text style={styles.previewValue}>
            {formatWon(plan?.appliedLimit ?? 0)}
          </Text>
        </View>
        <View style={styles.divider} />
        <KeyValueRow label="첫 주차 시작" value={firstWeekStart} />
        <KeyValueRow
          label="이번 주 내 유효 평일"
          value={`${plan?.eligibleDayCount ?? 0}일`}
        />
        <KeyValueRow
          label="계산식"
          value={`${formatWon(baseAmount || 0, false)} × ${plan?.eligibleDayCount ?? 0} ÷ 5`}
        />
        <Text style={styles.previewFootnote}>
          {weekendCreation
            ? "주말에는 다음 주 월요일에 첫 주차가 열리고 전체 평일이 적용돼요."
            : plan?.isLateJoin
              ? "주 중간에 시작해 남은 평일만큼 일할 계산돼요. 다음 주부터는 전체 한도가 적용됩니다."
              : "이번 주 전체 평일이 적용돼요."}
          {" "}
          공휴일이 끼면 서버가 자동으로 한도를 낮춰 계산해요.
        </Text>
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
          방을 만들면 주당 기준금액은 방을 닫기 전까지 변경할 수 없고, 챌린지는
          매주 자동으로 반복된다는 것을 확인했어요.
        </Text>
      </Pressable>

      <FormMessage message={formError} style={styles.formMessage} />
    </ModalFormScreen>
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

function validate(input: {
  name: string;
  baseAmount: number;
  capacity: number;
  confirmedImmutable: boolean;
}): string | null {
  if (!isValidRoomName(input.name)) {
    return input.name.trim()
      ? `방 이름은 ${ROOM_NAME_MAX_CHARACTERS}자 이내로 입력해 주세요.`
      : "방 이름을 입력해 주세요.";
  }
  if (!Number.isSafeInteger(input.baseAmount) || input.baseAmount < 1)
    return "주당 기준금액을 1원 이상의 정수로 입력해 주세요.";
  if (!isValidRoomCapacity(input.capacity)) {
    return `정원은 방장을 포함해 1~${DEFAULT_MAX_ACTIVE_MEMBERS}명으로 입력해 주세요.`;
  }
  if (!input.confirmedImmutable)
    return "기준금액이 고정되고 매주 반복된다는 내용을 확인해 주세요.";
  return null;
}

const styles = StyleSheet.create({
  selectionNotice: { marginTop: spacing.xl },
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
  previewFootnote: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.md,
  },
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
