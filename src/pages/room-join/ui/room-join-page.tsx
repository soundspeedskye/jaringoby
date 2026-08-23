import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { EmptyState } from "@/shared/ui/empty-state";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { KeyValueRow } from "@/shared/ui/key-value-row";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PrimaryButton } from "@/shared/ui/primary-button";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import type { InvitePreview } from "@/shared/api/types";
import { createPeriodTimeline, getPeriodPhase } from "@/shared/lib/domain/period";
import { isValidInviteCodeFormat, normalizeInviteCode } from "@/shared/lib/domain/invites";
import { useDeadlineNow } from "@/shared/lib/use-deadline-now";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { useActiveRoom } from "@/entities/room/api/use-rooms";
import { useAppStatus } from "@/shared/providers/app-status-provider";
import { formatWon } from "@/shared/lib/format";

export function RoomJoinPage() {
  const router = useRouter();
  const { joinRoom, previewInvite } = useAppActions();
  const activeRoom = useActiveRoom();
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
  // This modal may be opened from a deep link or a native stack whose previous
  // screen was removed. The room home is the stable return destination in both
  // cases, including when the user already belongs to a room.
  const returnToRoomHome = useCallback(() => {
    router.dismissTo("/");
  }, [router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        returnToRoomHome();
        return true;
      },
    );
    return () => subscription.remove();
  }, [returnToRoomHome]);

  const lookUp = async () => {
    setMessage(null);
    // Reject impossible codes locally: preview_invite is rate limited server-side,
    // so a typo should not spend one of the user's lookup attempts.
    if (!isValidInviteCodeFormat(normalizedCode)) {
      setPreview(null);
      setMessage("참여 코드는 영문·숫자 6자리예요.");
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

  // 한 사람은 한 방에만 참여할 수 있다. 이미 방에 있으면 새 방으로 곧장 참여하지
  // 않고, 현재 방을 나가고 참여하는 화면(원자적 전환)으로 넘긴다.
  const isSwitch = Boolean(
    activeRoom && preview && activeRoom.id !== preview.roomId,
  );

  const join = async () => {
    if (!preview) return;
    if (isSwitch) {
      // 참여 화면도 leave 화면도 모두 modal presentation이라, push하면 시트가
      // 두 겹으로 쌓인다. 전환 확정은 이 참여 흐름을 그대로 잇는 단계이므로
      // 현재 시트를 교체해 한 겹으로 이어지게 한다.
      router.replace({
        pathname: "/room/leave",
        params: {
          mode: "switch",
          joinCode: preview.code,
          targetName: preview.name,
        },
      });
      return;
    }
    setMessage(null);
    setJoining(true);
    try {
      await joinRoom(preview.code);
      router.dismissTo("/");
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "방에 참여하지 못했어요.",
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
        onBack={returnToRoomHome}
        testID="join-room-screen"
        title="방 참여"
      />
    );
  }

  const joinDisabled = !preview || !preview.canJoin;

  return (
    <ModalFormScreen
      headerBottomSpacing="md"
      onBack={returnToRoomHome}
      testID="join-room-screen"
      title="방 참여"
    >
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
                {phase
                  ? phaseLabel(phase, preview.participatesThisWeek)
                  : "다음 주 월요일 시작"}
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
            참여하면 합류 전 기록을 포함해 이 방의 정보 전체를 볼 수 있으며, 내
            정보도 이 방의 다른 멤버에게 공개됩니다.
          </NoticeBanner>

          {isSwitch && preview.canJoin ? (
            <NoticeBanner
              compact
              icon="swap-horizontal"
              style={styles.notice}
              tone="warning"
            >
              참여하려면 지금 참여 중인 “{activeRoom?.name}” 방에서 나가게
              됩니다.
            </NoticeBanner>
          ) : null}

          {!preview.canJoin ? (
            <NoticeBanner compact style={styles.notice} tone="danger">
              정원이 가득 찼거나 이미 참여한 방이에요.
            </NoticeBanner>
          ) : null}

          <PrimaryButton
            disabled={joinDisabled}
            label={
              preview.canJoin
                ? isSwitch
                  ? `현재 방 나가고 참여`
                  : preview.participatesThisWeek
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
          icon="ticket-confirmation-outline"
          title="코드를 확인하면 방을 미리볼 수 있습니다."
          variant="preview"
        />
      )}
    </ModalFormScreen>
  );
}

function phaseLabel(phase: string, participatesThisWeek: boolean): string {
  if (phase === "WAITING") return "다음 주차 대기 중 · 참여 가능";
  if (phase === "ACTIVE")
    return participatesThisWeek
      ? "이번 주 진행 중 · 오늘부터 참여"
      : "이번 주 진행 중";
  if (phase === "ADJUSTMENT") return "보정 중 · 다음 주부터 참여";
  if (phase === "SETTLEMENT") return "정산 중 · 다음 주부터 참여";
  return "완료";
}

const styles = StyleSheet.create({
  intro: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.xl,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
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
  lookupText: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  message: { marginTop: spacing.sm },
  preview: {
    padding: spacing.xl,
    marginTop: spacing.xl,
    backgroundColor: palette.paper,
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
  phase: {
    color: palette.coralText,
    fontFamily: fonts.handBold,
    fontSize: 11,
    fontWeight: "700",
  },
  roomName: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 2,
  },
  period: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    marginTop: 4,
    ...tabularNums,
  },
  ruleBox: {
    marginTop: spacing.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  limitBox: { alignItems: "center", paddingVertical: spacing.xl },
  limitLabel: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
  limitValue: {
    color: palette.green,
    fontFamily: fonts.number,
    fontSize: 32,
    fontWeight: "800",
    marginTop: 4,
    ...tabularNums,
  },
  formula: {
    color: palette.ink,
    fontFamily: fonts.number,
    fontSize: 12,
    marginTop: 5,
    ...tabularNums,
  },
  holidays: {
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(240,185,46,0.12)",
    marginBottom: spacing.md,
  },
  holidayTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 11,
    fontWeight: "700",
  },
  holidayDates: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 3,
    ...tabularNums,
  },
  visibilityNotice: { marginBottom: spacing.md },
  notice: { marginBottom: spacing.sm },
});
