import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Field } from "@/components/ui/field";
import { PlatformDateTimePicker } from "@/components/ui/platform-date-time-picker";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import type { Challenge } from "@/data/types";
import {
  createChallengeTimeline,
  EXPENSE_CATEGORIES,
  getChallengePhase,
  toSeoulLocalDate,
  type ExpenseCategory,
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
  const { activeChallenge, currentUser, getMembers } = useAppData();
  const currentMember =
    activeChallenge && currentUser
      ? getMembers(activeChallenge.id).find(
          (member) => member.userId === currentUser.id,
        )
      : undefined;
  const timeline = useMemo(
    () =>
      activeChallenge
        ? createChallengeTimeline({
            startDate: activeChallenge.startDate,
            endDate: activeChallenge.endDate,
          })
        : null,
    [activeChallenge],
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
    chooseInitialOccurrence(activeChallenge, currentMember?.joinedAt),
  );
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [clientRequestId] = useState(createUuid);

  if (!activeChallenge || !currentMember) {
    return (
      <Screen testID="new-expense-screen">
        <Header onBack={() => router.back()} />
        <View style={styles.empty}>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="calendar-remove-outline"
            size={42}
          />
          <Text style={styles.emptyTitle}>진행 중인 챌린지가 없어요.</Text>
          <Text style={styles.emptyBody}>
            챌린지 지출은 참여 중인 방에서만 사진과 함께 기록할 수 있어요.
          </Text>
          <PrimaryButton
            label="홈으로 돌아가기"
            onPress={() => router.replace("/")}
            variant="secondary"
          />
        </View>
      </Screen>
    );
  }

  if (!timeline) return null;
  const phase = getChallengePhase(timeline, now);
  const canMutate = phase === "ACTIVE" || phase === "ADJUSTMENT";
  const effectiveDates = activeChallenge.selectedDates.filter(
    (date) => !activeChallenge.holidayDates.includes(date),
  );

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
    if (!effectiveDates.includes(toSeoulLocalDate(occurredAt))) {
      setFormError(
        "선택일이 아니거나 공휴일인 날짜의 지출은 챌린지에 넣을 수 없어요.",
      );
      return;
    }
    if (occurredAt.getTime() < Date.parse(currentMember.joinedAt)) {
      setFormError("합류 전 지출은 챌린지에 소급 등록할 수 없어요.");
      return;
    }
    if (
      occurredAt.getTime() < timeline.S ||
      occurredAt.getTime() >= timeline.E
    ) {
      setFormError("챌린지 기간 안에서 발생한 지출만 등록할 수 있어요.");
      return;
    }

    setSubmitting(true);
    try {
      const expense = await addExpense({
        challengeId: activeChallenge.id,
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
    <Screen testID="new-expense-screen">
      <Header onBack={() => router.back()} />

      <View style={styles.roomChip}>
        <MaterialCommunityIcons
          color={palette.green}
          name="shield-check-outline"
          size={17}
        />
        <Text numberOfLines={1} style={styles.roomName}>
          {activeChallenge.name}
        </Text>
        <Text style={styles.phaseLabel}>
          {phase === "ADJUSTMENT" ? "보정 입력" : "챌린지 지출"}
        </Text>
      </View>

      {!canMutate ? (
        <View style={styles.locked}>
          <MaterialCommunityIcons
            color={palette.danger}
            name="lock-outline"
            size={20}
          />
          <Text style={styles.lockedText}>
            {phase === "WAITING"
              ? "챌린지가 시작되면 지출을 기록할 수 있어요."
              : "보정 마감이 지나 지출 입력이 잠겼어요."}
          </Text>
        </View>
      ) : null}

      <View style={styles.photoSection}>
        <Text style={styles.sectionTitle}>
          지출 사진 1장 <Text style={styles.required}>필수</Text>
        </Text>
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
      </View>

      <Field
        keyboardType="number-pad"
        label="금액"
        onChangeText={setAmountText}
        placeholder="예: 12000"
        value={amountText}
      />

      <View style={styles.categorySection}>
        <Text style={styles.sectionTitle}>카테고리</Text>
        <View style={styles.categories}>
          {EXPENSE_CATEGORIES.map((item) => {
            const selected = item === category;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={item}
                onPress={() => setCategory(item)}
                style={[styles.category, selected && styles.categorySelected]}
              >
                <MaterialCommunityIcons
                  color={selected ? palette.cream : palette.green}
                  name={CATEGORY_ICONS[item]}
                  size={20}
                />
                <Text
                  style={[
                    styles.categoryText,
                    selected && styles.categoryTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.timeSection}>
        <Text style={styles.sectionTitle}>발생 일시</Text>
        <Text style={styles.timeValue}>{formatSeoulDateTime(occurredAt)}</Text>
        <View style={styles.timeButtons}>
          <OccurrencePicker
            label="날짜 변경"
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
      </View>

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

      {formError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {formError}
        </Text>
      ) : null}
      <PrimaryButton
        disabled={!canMutate}
        label="사진과 함께 지출 저장"
        loading={submitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="뒤로"
        onPress={onBack}
        style={styles.backButton}
      >
        <MaterialCommunityIcons
          color={palette.green}
          name="chevron-left"
          size={26}
        />
      </Pressable>
      <Text style={styles.title}>지출 기록</Text>
    </View>
  );
}

function OccurrencePicker({
  label,
  mode,
  value,
  onChange,
}: {
  label: string;
  mode: "date" | "time";
  value: Date;
  onChange: (value: Date) => void;
}) {
  return (
    <PlatformDateTimePicker
      mode={mode}
      onChange={onChange}
      renderTrigger={(open) => (
        <View>
          <Pressable onPress={open} style={styles.timeButton}>
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
  challenge: Challenge | null,
  joinedAt?: string,
  now = Date.now(),
): Date {
  if (!challenge) return new Date(now);
  const effectiveDates = challenge.selectedDates.filter(
    (date) =>
      !challenge.holidayDates.includes(date) &&
      (!joinedAt || date >= toSeoulLocalDate(joinedAt)),
  );
  const today = toSeoulLocalDate(now);
  if (
    effectiveDates.includes(today) &&
    (!joinedAt || now >= Date.parse(joinedAt))
  )
    return new Date(now);
  const fallback = effectiveDates.at(-1) ?? challenge.endDate;
  return new Date(`${fallback}T12:00:00+09:00`);
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  title: { color: palette.ink, fontSize: 28, fontWeight: "700", marginTop: 3 },
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
  locked: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(182,83,72,0.10)",
  },
  lockedText: { flex: 1, color: palette.danger, fontSize: 12, lineHeight: 18 },
  photoSection: { gap: spacing.md, marginVertical: spacing.xl },
  sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: "700" },
  required: { color: palette.coralText, fontSize: 11 },
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
  categorySection: { gap: spacing.md, marginVertical: spacing.xl },
  categories: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  category: {
    width: "31%",
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.44)",
  },
  categorySelected: {
    backgroundColor: palette.green,
    borderColor: palette.green,
  },
  categoryText: { color: palette.green, fontSize: 11, fontWeight: "600" },
  categoryTextSelected: { color: palette.cream },
  timeSection: { gap: spacing.sm, marginBottom: spacing.xl },
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
  error: { color: palette.danger, fontSize: 12, marginBottom: spacing.md },
  empty: { alignItems: "center", paddingTop: 100, gap: spacing.sm },
  emptyTitle: { color: palette.ink, fontSize: 18, fontWeight: "700" },
  emptyBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: spacing.md,
  },
});
