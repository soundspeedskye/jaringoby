import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ModalFormScreen } from "@/components/layout/modal-form-screen";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { GlassSurface } from "@/components/ui/glass-surface";
import { KeyValueRow } from "@/components/ui/key-value-row";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PrimaryButton } from "@/components/ui/primary-button";
import { palette, radii, spacing } from "@/constants/design";
import type { InvitePreview } from "@/data/types";
import {
  createPeriodTimeline,
  getPeriodPhase,
  isValidInviteCodeFormat,
  normalizeInviteCode,
} from "@/domain";
import { useAppActions } from "@/providers/app-actions-provider";
import { useAppStatus } from "@/providers/app-status-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { formatWon } from "@/utils/format";

export default function JoinRoomScreen() {
  const router = useRouter();
  const { joinRoom, previewInvite } = useAppActions();
  const { loading } = useAppStatus();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [joining, setJoining] = useState(false);
  const timeline = useMemo(
    () =>
      preview?.currentPeriod
        ? createPeriodTimeline(preview.currentPeriod.weekStart)
        : null,
    [preview],
  );
  const now = useDeadlineNow(
    timeline ? [timeline.S, timeline.E, timeline.C, timeline.F] : [],
    Boolean(timeline),
  );
  const normalizedCode = normalizeInviteCode(code);
  const phase = timeline ? getPeriodPhase(timeline, now) : null;

  const lookUp = async () => {
    setMessage(null);
    // Reject impossible codes locally: preview_invite is rate limited server-side,
    // so a typo should not spend one of the user's lookup attempts.
    if (!isValidInviteCodeFormat(normalizedCode)) {
      setPreview(null);
      setMessage("참여 코드는 6자리이고 0·1·I·L·O는 쓰지 않아요.");
      return;
    }
    setPreviewing(true);
    try {
      setPreview(await previewInvite(normalizedCode));
    } catch (reason) {
      setPreview(null);
      setMessage(
        reason instanceof Error
          ? reason.message
          : "코드와 일치하는 방을 찾지 못했어요.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const join = async () => {
    if (!preview) return;
    setMessage(null);
    setJoining(true);
    try {
      await joinRoom(preview.code);
      router.replace("/");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "방에 참여하지 못했어요.",
      );
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <ModalFormScreen
        headerBottomSpacing="md"
        loading
        onBack={() => router.back()}
        testID="join-room-screen"
        title="방 참여"
      />
    );
  }

  const joinDisabled = !preview || !preview.canJoin;

  return (
    <ModalFormScreen
      headerBottomSpacing="md"
      onBack={() => router.back()}
      testID="join-room-screen"
      title="방 참여"
    >
      <Text style={styles.intro}>
        초대받은 6자리 코드를 입력하면 참여 전에 이번 주차와 내 적용한도를
        확인할 수 있어요.
      </Text>
      <View style={styles.codeRow}>
        <View style={styles.codeField}>
          <Field
            autoCapitalize="characters"
            autoCorrect={false}
            label="참여 코드"
            maxLength={6}
            onChangeText={(value) => {
              setCode(normalizeInviteCode(value));
              setPreview(null);
              setMessage(null);
            }}
            placeholder="SAVE55"
            value={code}
          />
        </View>
        <Pressable
          accessibilityLabel={
            previewing ? "참여 코드 확인 중" : "참여 코드 확인"
          }
          accessibilityRole="button"
          accessibilityState={{ busy: previewing, disabled: previewing }}
          disabled={previewing}
          onPress={() => void lookUp()}
          style={styles.lookupButton}
        >
          {previewing ? (
            <ActivityIndicator color={palette.cream} size="small" />
          ) : (
            <MaterialCommunityIcons
              color={palette.cream}
              name="magnify"
              size={20}
            />
          )}
          <Text style={styles.lookupText}>
            {previewing ? "확인 중" : "확인"}
          </Text>
        </Pressable>
      </View>

      <FormMessage message={message} style={styles.message} />

      {preview ? (
        <GlassSurface style={styles.preview} testID="invite-preview-card">
          <View style={styles.previewHero}>
            <View style={styles.previewIcon}>
              <MaterialCommunityIcons
                color={palette.yellow}
                name="shield-star-outline"
                size={28}
              />
            </View>
            <View style={styles.previewCopy}>
              <Text style={styles.phase}>
                {phase ? phaseLabel(phase, preview.participatesThisWeek) : "다음 주 월요일 시작"}
              </Text>
              <Text style={styles.roomName}>{preview.name}</Text>
              <Text style={styles.period}>
                {preview.currentPeriod
                  ? `이번 주차 ${preview.currentPeriod.weekStart} ~ ${preview.currentPeriod.weekEnd}`
                  : "매주 월~금 자동 반복"}
              </Text>
            </View>
          </View>

          <View style={styles.ruleBox}>
            <KeyValueRow
              label="주당 기준금액"
              value={formatWon(preview.baseAmount)}
            />
            <KeyValueRow
              label="이번 주 유효 평일"
              value={
                preview.currentPeriod
                  ? `${preview.currentPeriod.validDayCount}일 (공휴일 ${preview.currentPeriod.holidayDates.length}일 제외)`
                  : "다음 주에 확정"
              }
            />
            <KeyValueRow
              label="현재 인원"
              value={`${preview.memberCount}/${preview.capacity}명`}
            />
          </View>

          <View style={styles.limitBox}>
            <Text style={styles.limitLabel}>
              {preview.participatesThisWeek
                ? `${preview.joinedDate} 합류 시 이번 주 내 적용한도`
                : "이번 주는 참여 없이, 다음 주부터 전체 한도"}
            </Text>
            <Text style={styles.limitValue}>
              {formatWon(
                preview.participatesThisWeek
                  ? preview.appliedLimit
                  : preview.baseAmount,
              )}
            </Text>
            <Text style={styles.formula}>
              {preview.participatesThisWeek
                ? `${formatWon(preview.baseAmount, false)} × ${preview.eligibleDayCount}일 ÷ ${preview.currentPeriod?.selectedDayCount ?? 5}일`
                : "매주 월요일에 그 주 한도가 새로 계산돼요"}
            </Text>
          </View>

          {preview.currentPeriod?.holidayDates.length ? (
            <View style={styles.holidays}>
              <Text style={styles.holidayTitle}>이번 주 제외 공휴일</Text>
              <Text style={styles.holidayDates}>
                {preview.currentPeriod.holidayDates.join(" · ")}
              </Text>
            </View>
          ) : null}

          <NoticeBanner
            icon="image-multiple-outline"
            style={styles.visibilityNotice}
            tone="warning"
          >
            참여하면 합류 전 기록을 포함해 이 방의 지출 사진과 댓글 전체를 볼 수
            있고, 내 챌린지 지출도 멤버에게 공유돼요.
          </NoticeBanner>

          {!preview.canJoin ? (
            <NoticeBanner compact style={styles.notice} tone="danger">
              현재는 이 방에 참여할 수 없어요. 정원이 가득 찼거나 이미 참여한
              방이에요.
            </NoticeBanner>
          ) : null}

          <PrimaryButton
            disabled={joinDisabled}
            label={
              preview.canJoin
                ? preview.participatesThisWeek
                  ? `${formatWon(preview.appliedLimit)} 한도로 참여`
                  : "다음 주부터 참여"
                : "참여할 수 없음"
            }
            loading={joining}
            onPress={() => void join()}
          />
        </GlassSurface>
      ) : (
        <EmptyState
          description="참여 버튼을 누르기 전에는 방에 들어가지 않아요."
          icon="ticket-confirmation-outline"
          title="코드를 확인하면 방 미리보기가 열려요."
          variant="preview"
        />
      )}
    </ModalFormScreen>
  );
}

function phaseLabel(phase: string, participatesThisWeek: boolean): string {
  if (phase === "WAITING") return "다음 주차 대기 중 · 참여 가능";
  if (phase === "ACTIVE")
    return participatesThisWeek ? "이번 주 진행 중 · 오늘부터 참여" : "이번 주 진행 중";
  if (phase === "ADJUSTMENT") return "보정 중 · 다음 주부터 참여";
  if (phase === "SETTLEMENT") return "정산 중 · 다음 주부터 참여";
  return "완료";
}

const styles = StyleSheet.create({
  intro: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  codeRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  codeField: { flex: 1 },
  lookupButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: palette.green,
  },
  lookupText: { color: palette.cream, fontSize: 14, fontWeight: "700" },
  message: { marginTop: spacing.sm },
  preview: {
    padding: spacing.xl,
    marginTop: spacing.xl,
    backgroundColor: "rgba(255,253,247,0.66)",
  },
  previewHero: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  previewIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: palette.green,
  },
  previewCopy: { flex: 1 },
  phase: { color: palette.coralText, fontSize: 11, fontWeight: "700" },
  roomName: {
    color: palette.ink,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 2,
  },
  period: { color: palette.muted, fontSize: 12, marginTop: 4 },
  ruleBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  limitBox: { alignItems: "center", paddingVertical: spacing.xl },
  limitLabel: { color: palette.muted, fontSize: 12 },
  limitValue: {
    color: palette.green,
    fontSize: 32,
    fontWeight: "800",
    marginTop: 4,
  },
  formula: { color: palette.ink, fontSize: 12, marginTop: 5 },
  holidays: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(240,185,46,0.12)",
    marginBottom: spacing.md,
  },
  holidayTitle: { color: palette.ink, fontSize: 11, fontWeight: "700" },
  holidayDates: {
    color: palette.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
  },
  visibilityNotice: { marginBottom: spacing.md },
  notice: { marginBottom: spacing.sm },
});
