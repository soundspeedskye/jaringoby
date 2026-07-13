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

import { Field } from "@/components/ui/field";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import type { InvitePreview } from "@/data/types";
import {
  createChallengeTimeline,
  getChallengePhase,
  normalizeInviteCode,
} from "@/domain";
import { useAppActions, useAppData } from "@/providers/app-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { formatWon } from "@/utils/format";

export default function JoinChallengeScreen() {
  const router = useRouter();
  const { joinChallenge, previewInvite } = useAppActions();
  const { loading } = useAppData();
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [joining, setJoining] = useState(false);
  const timeline = useMemo(
    () =>
      preview
        ? createChallengeTimeline({
            startDate: preview.startDate,
            endDate: preview.endDate,
          })
        : null,
    [preview],
  );
  const now = useDeadlineNow(
    timeline ? [timeline.S, timeline.E, timeline.C, timeline.F] : [],
    Boolean(timeline),
  );
  const normalizedCode = normalizeInviteCode(code);
  const phase = timeline ? getChallengePhase(timeline, now) : null;

  const lookUp = async () => {
    setMessage(null);
    if (normalizedCode.length !== 6) {
      setPreview(null);
      setMessage("참여 코드는 6자리예요.");
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
          : "코드와 일치하는 챌린지를 찾지 못했어요.",
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
      await joinChallenge(preview.code);
      router.replace("/");
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "챌린지에 참여하지 못했어요.",
      );
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.green} size="large" />
        </View>
      </Screen>
    );
  }

  const joinDisabled = !preview || !preview.canJoin;

  return (
    <Screen testID="join-challenge-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="뒤로"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            color={palette.green}
            name="chevron-left"
            size={26}
          />
        </Pressable>
        <View>
          <Text style={styles.title}>챌린지 참여</Text>
        </View>
      </View>

      <Text style={styles.intro}>
        초대받은 6자리 코드를 입력하면 참여 전에 기간과 내 적용한도를 확인할 수
        있어요.
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
            placeholder="SAVE50"
            value={code}
          />
        </View>
        <Pressable
          accessibilityRole="button"
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

      {message ? (
        <Text accessibilityRole="alert" style={styles.message}>
          {message}
        </Text>
      ) : null}

      {preview && phase ? (
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
              <Text style={styles.phase}>{phaseLabel(phase)}</Text>
              <Text style={styles.challengeName}>{preview.name}</Text>
              <Text style={styles.period}>
                {preview.startDate} ~ {preview.endDate}
              </Text>
            </View>
          </View>

          <View style={styles.ruleBox}>
            <InfoRow label="기준금액" value={formatWon(preview.baseLimit)} />
            <InfoRow
              label="전체 선택일"
              value={`${preview.totalSelectedDays}일`}
            />
            <InfoRow
              label="공휴일 제외"
              value={`${preview.holidayDates.length}일`}
            />
            <InfoRow
              label="현재 인원"
              value={`${preview.memberCount}/${preview.capacity}명`}
            />
          </View>

          <View style={styles.limitBox}>
            <Text style={styles.limitLabel}>
              {preview.joinedDate} 합류 시 내 적용한도
            </Text>
            <Text style={styles.limitValue}>
              {formatWon(preview.appliedLimit)}
            </Text>
            <Text style={styles.formula}>
              {formatWon(preview.baseLimit, false)} ×{" "}
              {preview.remainingEffectiveDays}일 ÷ {preview.totalSelectedDays}일
            </Text>
          </View>

          {preview.holidayDates.length ? (
            <View style={styles.holidays}>
              <Text style={styles.holidayTitle}>
                방 생성 시 고정된 제외 공휴일
              </Text>
              <Text style={styles.holidayDates}>
                {preview.holidayDates.join(" · ")}
              </Text>
            </View>
          ) : null}

          <View style={styles.visibilityNotice}>
            <MaterialCommunityIcons
              color={palette.coral}
              name="image-multiple-outline"
              size={20}
            />
            <Text style={styles.visibilityText}>
              참여하면 합류 전 기록을 포함해 이 방의 지출 사진과 댓글 전체를 볼
              수 있고, 내 챌린지 지출도 멤버에게 공유돼요.
            </Text>
          </View>

          {!preview.canJoin ? (
            <Notice text="현재는 이 방에 참여할 수 없어요. 정원과 남은 기간을 확인해 주세요." />
          ) : null}

          <PrimaryButton
            disabled={joinDisabled}
            label={
              preview.canJoin
                ? `${formatWon(preview.appliedLimit)} 한도로 참여`
                : "참여할 수 없음"
            }
            loading={joining}
            onPress={() => void join()}
          />
        </GlassSurface>
      ) : (
        <View style={styles.emptyPreview}>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="ticket-confirmation-outline"
            size={38}
          />
          <Text style={styles.emptyTitle}>
            코드를 확인하면 방 미리보기가 열려요.
          </Text>
          <Text style={styles.emptyBody}>
            참여 버튼을 누르기 전에는 방에 들어가지 않아요.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <MaterialCommunityIcons
        color={palette.danger}
        name="alert-circle-outline"
        size={17}
      />
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "WAITING") return "시작 전 · 참여 가능";
  if (phase === "ACTIVE") return "진행 중 · 중도 합류";
  if (phase === "ADJUSTMENT") return "보정 중";
  if (phase === "SETTLEMENT") return "정산 중";
  return "완료";
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
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
  kicker: {
    color: palette.green,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  title: { color: palette.ink, fontSize: 28, fontWeight: "700", marginTop: 3 },
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
  message: { color: palette.danger, fontSize: 12, marginTop: spacing.sm },
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
  challengeName: {
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
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoLabel: { color: palette.muted, fontSize: 12 },
  infoValue: { color: palette.ink, fontSize: 12, fontWeight: "600" },
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
  visibilityNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(233,135,98,0.10)",
  },
  visibilityText: { flex: 1, color: palette.ink, fontSize: 11, lineHeight: 18 },
  notice: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  noticeText: { flex: 1, color: palette.danger, fontSize: 11 },
  emptyPreview: { alignItems: "center", paddingVertical: 90 },
  emptyTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  emptyBody: { color: palette.muted, fontSize: 12, marginTop: 5 },
});
