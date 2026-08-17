import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExceptionApprovalInbox } from "@/features/exception-approval";
import { RecentExpenseCarousel } from "@/entities/expense/ui/recent-expense-carousel";
import { RoomBoardPreview } from "./room-board-preview";
import { RoomHero } from "@/entities/room/ui/room-hero";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import {
  fonts,
  palette,
  radii,
  shadow,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { isExpenseMutationPhase } from "@/shared/lib/domain/permissions";
import type { PeriodPhase } from "@/shared/model/types";
import type { RoomHomeActions, RoomHomeData } from "../model/types";
import { useUnreadNotificationCount } from "@/shared/providers/app-data-hooks";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { formatDateLabel } from "@/shared/lib/format";

export const RoomHomeHeader = memo(function RoomHomeHeader({
  actions,
  data,
}: {
  actions: RoomHomeActions;
  data: RoomHomeData;
}) {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const unreadNotificationCount = useUnreadNotificationCount();
  const {
    activeRoom,
    appliedLimit,
    commentCounts,
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
    profilesById,
    recentExpenses,
    timeline,
    weekMonthLabel,
    weekDays,
    weekRangeLabel,
  } = data;
  const {
    addExpense,
    clearError,
    createRoom,
    joinRoom,
    onOpenExpense,
    onOpenMemberFeed,
  } = actions;
  const isRoomOwner = activeRoom.ownerId === currentUser.id;
  // 제목·본문 없이 항목만 보여준다. 다이얼로그가 떴다는 것 자체가 "고르세요"라는 뜻이다.
  const openRoomActions = () => {
    showDialog(undefined, undefined, [
      { text: "취소", style: "cancel" },
      { text: "참여 코드로 참여", onPress: joinRoom },
      { text: "새 챌린지 만들기", onPress: createRoom },
    ]);
  };
  return (
    <>
      <ExceptionApprovalInbox />
      <View style={styles.topActions}>
        <Text style={styles.greeting}>
          {currentUser.nickname}님, 이번주도 모아볼까요?
        </Text>
        <View style={styles.actionButtons}>
          <Pressable
            accessibilityLabel={
              unreadNotificationCount
                ? `소식함, 읽지 않은 소식 ${unreadNotificationCount}개`
                : "소식함"
            }
            onPress={() => router.push("/notifications")}
            style={styles.circleButton}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name={unreadNotificationCount ? "bell" : "bell-outline"}
              size={21}
            />
            {unreadNotificationCount ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="방 만들기 또는 코드로 참여"
            onPress={openRoomActions}
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
        participants={memberRows}
        onPressSettings={
          isRoomOwner ? () => router.push("/room/edit") : undefined
        }
      />

      <RoomBoardPreview roomId={activeRoom.id} />

      <RecentExpenseCarousel
        commentCounts={commentCounts}
        expenses={recentExpenses}
        onOpenExpense={onOpenExpense}
        onOpenMemberFeed={onOpenMemberFeed}
        profilesById={profilesById}
      />

      <View style={styles.inviteSection}>
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
        {!currentPeriod.isRestWeek &&
        currentMember &&
        isExpenseMutationPhase(phase) ? (
          <Pressable
            accessibilityLabel="지출 등록"
            accessibilityRole="button"
            onPress={addExpense}
            style={styles.addExpenseButton}
          >
            <MaterialCommunityIcons
              color={palette.cream}
              name="camera-plus-outline"
              size={18}
            />
            <Text style={styles.addButtonText}>지출 등록</Text>
          </Pressable>
        ) : null}
      </View>

      {currentPeriod.isRestWeek ? (
        <NoticeBanner icon="palm-tree" style={styles.phaseBanner}>
          이번 주는 평일이 모두 공휴일이라 쉬는 주예요. 누적 기록에는 포함되지
          않아요.
        </NoticeBanner>
      ) : (
        <PhaseBanner phase={phase} timeline={timeline} />
      )}
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
  notificationBadge: {
    position: "absolute",
    top: -1,
    right: -3,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: palette.coral,
    borderWidth: 1,
    borderColor: palette.cream,
  },
  notificationBadgeText: {
    color: palette.cream,
    fontFamily: fonts.number,
    fontSize: 9,
    fontWeight: "800",
    ...tabularNums,
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
  inviteSection: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(52,49,40,0.12)",
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
  addExpenseButton: {
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
