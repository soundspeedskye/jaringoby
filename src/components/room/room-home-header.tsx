import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { MemberList } from "@/components/room/member-list";
import { RoomHero } from "@/components/room/room-hero";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { SectionHeader } from "@/components/ui/section-header";
import {
  fonts,
  palette,
  radii,
  shadow,
  spacing,
  tabularNums,
} from "@/constants/design";
import { isExpenseMutationPhase, type PeriodPhase } from "@/domain";
import type { RoomHomeActions, RoomHomeData } from "@/hooks/use-room-home";
import { formatDateLabel } from "@/utils/format";

export const RoomHomeHeader = memo(function RoomHomeHeader({
  actions,
  data,
}: {
  actions: RoomHomeActions;
  data: RoomHomeData;
}) {
  const {
    activeRoom,
    appliedLimit,
    currentMember,
    currentPeriod,
    currentUser,
    daysRemaining,
    error,
    memberRows,
    myPendingCount,
    myPendingDelta,
    mySpent,
    phase,
    timeline,
    weekMonthLabel,
    weekDays,
    weekRangeLabel,
  } = data;
  const { addExpense, clearError, createRoom, joinRoom } = actions;
  return (
    <>
      <View style={styles.topActions}>
        <Text style={styles.greeting}>
          {currentUser.nickname}님, 이번주도 모아볼까요?
        </Text>
        <View style={styles.actionButtons}>
          <Pressable
            accessibilityLabel="코드로 참여"
            onPress={joinRoom}
            style={styles.circleButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="ticket-confirmation-outline"
              size={21}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="새 챌린지 만들기"
            onPress={createRoom}
            style={styles.circleButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="plus"
              size={23}
            />
          </Pressable>
        </View>
      </View>

      {error ? (
        <Pressable
          accessibilityRole="alert"
          onPress={clearError}
          style={styles.errorBanner}
        >
          <Text style={styles.errorText}>{error}</Text>
          <MaterialCommunityIcons
            color={palette.danger}
            name="close"
            size={18}
          />
        </Pressable>
      ) : null}

      <RoomHero
        appliedLimit={appliedLimit}
        daysRemaining={daysRemaining}
        pendingDelta={myPendingDelta}
        pendingCount={myPendingCount}
        spent={mySpent}
        title={activeRoom.name}
        weekDays={weekDays}
        weekIndex={currentPeriod.weekIndex}
        weekMonthLabel={weekMonthLabel}
        weekRangeLabel={weekRangeLabel}
      />

      <View style={styles.memberSection} testID="member-list-section">
        <MemberList members={memberRows} />
        <View style={styles.memberFooter}>
          <View style={styles.inviteCopy}>
            <Text style={styles.codeLabel}>같이 도전하기</Text>
            <Text style={styles.codeHint}>참여 코드를 공유하세요</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`참여 코드 ${activeRoom.inviteCode}, 현재 ${memberRows.length}명, 최대 ${activeRoom.capacity}명`}
            style={styles.codePill}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="link-variant"
              size={16}
            />
            <Text selectable style={styles.code}>
              {activeRoom.inviteCode}
            </Text>
            <View style={styles.codeDivider} />
            <Text style={styles.capacity}>
              {memberRows.length}/{activeRoom.capacity}명
            </Text>
          </View>
        </View>
      </View>

      {currentPeriod.isRestWeek ? (
        <NoticeBanner icon="palm-tree" style={styles.phaseBanner}>
          이번 주는 평일이 모두 공휴일이라 쉬는 주예요. 누적 기록에는 포함되지
          않아요.
        </NoticeBanner>
      ) : (
        <PhaseBanner phase={phase} timeline={timeline} />
      )}

      <SectionHeader
        right={
          !currentPeriod.isRestWeek &&
          currentMember &&
          isExpenseMutationPhase(phase) ? (
            <Pressable
              accessibilityRole="button"
              onPress={addExpense}
              style={styles.addButton}
            >
              <MaterialCommunityIcons
                color={palette.cream}
                name="camera-plus-outline"
                size={18}
              />
              <Text style={styles.addButtonText}>지출</Text>
            </Pressable>
          ) : null
        }
        style={styles.feedHeader}
        title="멤버별 최근 지출"
      />
    </>
  );
});

function PhaseBanner({
  phase,
  timeline,
}: {
  phase: PeriodPhase;
  timeline: { E: number; C: number; F: number };
}) {
  if (phase === "ACTIVE" || phase === "WAITING") return null;
  const copy =
    phase === "ADJUSTMENT"
      ? `보정 중 · ${formatDateLabel(new Date(timeline.C))}까지 기간 내 지출을 수정할 수 있어요.`
      : phase === "SETTLEMENT"
        ? `정산 중 · 지출이 잠겼어요. ${formatDateLabel(new Date(timeline.F))}에 결과가 확정돼요.`
        : "정산이 끝난 주차예요. 기록은 읽기 전용으로 보관됩니다.";
  return (
    <NoticeBanner icon="clock-outline" style={styles.phaseBanner}>
      {copy}
    </NoticeBanner>
  );
}

const styles = StyleSheet.create({
  topActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  greeting: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 19,
    fontWeight: "600",
    marginTop: 3,
  },
  actionButtons: { flexDirection: "row", gap: spacing.sm },
  circleButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(182,83,72,0.10)",
  },
  errorText: {
    color: palette.danger,
    flex: 1,
    fontFamily: fonts.hand,
    fontSize: 13,
  },
  memberSection: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  memberFooter: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(52,49,40,0.12)",
  },
  inviteCopy: { flex: 1, minWidth: 0 },
  codeLabel: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  codeHint: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    marginTop: 3,
  },
  codePill: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  code: {
    color: palette.green,
    fontFamily: fonts.number,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    ...tabularNums,
  },
  codeDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: "rgba(52,49,40,0.18)",
  },
  capacity: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    fontWeight: "600",
    ...tabularNums,
  },
  phaseBanner: {
    marginTop: spacing.lg,
  },
  feedHeader: {
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: palette.green,
    ...shadow,
  },
  addButtonText: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
});
