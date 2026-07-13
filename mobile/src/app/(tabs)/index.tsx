import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { CalculationCard } from "@/components/challenge/calculation-card";
import { ChallengeHero } from "@/components/challenge/challenge-hero";
import {
  MemberList,
  type MemberListItem,
} from "@/components/challenge/member-list";
import { MemberExpenseDropdown } from "@/components/expense/member-expense-dropdown";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, shadow, spacing } from "@/constants/design";
import type { Expense } from "@/data/types";
import {
  addLocalDays,
  createChallengeTimeline,
  getChallengePhase,
  startOfSeoulDate,
  toSeoulLocalDate,
} from "@/domain";
import { useAppActions, useAppData } from "@/providers/app-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { formatDateLabel, formatWon } from "@/utils/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_EXPENSES: Expense[] = [];

export default function ChallengeHomeScreen() {
  const router = useRouter();
  const {
    activeChallenge,
    currentUser,
    error,
    getComments,
    getCrownIds,
    getExpenses,
    getMembers,
    getProfile,
    loading,
  } = useAppData();
  const { clearError } = useAppActions();
  const members = useMemo(
    () => (activeChallenge ? getMembers(activeChallenge.id) : []),
    [activeChallenge, getMembers],
  );
  const expenses = useMemo(
    () =>
      activeChallenge
        ? [...getExpenses(activeChallenge.id)].sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
          )
        : [],
    [activeChallenge, getExpenses],
  );
  const expensesByUserId = useMemo(() => {
    const grouped = new Map<string, Expense[]>();
    expenses.forEach((expense) => {
      const memberExpenses = grouped.get(expense.userId);
      if (memberExpenses) memberExpenses.push(expense);
      else grouped.set(expense.userId, [expense]);
    });
    return grouped;
  }, [expenses]);
  const getCommentCount = useCallback(
    (expenseId: string) =>
      getComments(expenseId).filter((comment) => !comment.deletedAt).length,
    [getComments],
  );
  const openExpense = useCallback(
    (expenseId: string) => router.push(`/expense/${expenseId}`),
    [router],
  );
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
  const nextSeoulMidnight = startOfSeoulDate(
    addLocalDays(toSeoulLocalDate(Date.now()), 1),
  );
  const now = useDeadlineNow(
    timeline
      ? [
          timeline.S,
          timeline.E,
          timeline.C,
          timeline.F,
          nextSeoulMidnight,
        ]
      : [],
    Boolean(timeline),
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.green} size="large" />
        </View>
      </Screen>
    );
  }

  if (!activeChallenge || !currentUser || !timeline) {
    return (
      <Screen>
        <View style={styles.emptyHeader}>
          <Text style={styles.kicker}>JARINGOBY</Text>
          <Text style={styles.emptyTitle}>
            함께하면 더 오래 지킬 수 있어요.
          </Text>
          <Text style={styles.emptyBody}>
            기간과 기준금액을 정하고 친구를 초대해 첫 챌린지를 시작해 보세요.
          </Text>
        </View>
        <View style={styles.emptyActions}>
          <PrimaryButton
            label="챌린지 만들기"
            onPress={() => router.push("/challenge/create")}
          />
          <PrimaryButton
            label="참여 코드 입력"
            onPress={() => router.push("/challenge/join")}
            variant="secondary"
          />
        </View>
      </Screen>
    );
  }

  const phase = getChallengePhase(timeline, now);
  const currentMember = members.find(
    (member) => member.userId === currentUser.id,
  );
  const mySpent = expenses
    .filter((expense) => expense.userId === currentUser.id)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const appliedLimit = currentMember?.appliedLimit ?? activeChallenge.baseLimit;
  const today = toSeoulLocalDate(now);
  const daysRemaining = Math.max(
    0,
    Math.round(
      (startOfSeoulDate(activeChallenge.endDate) - startOfSeoulDate(today)) /
        DAY_MS,
    ),
  );
  const crownIds = getCrownIds(activeChallenge.id);
  const memberRows: MemberListItem[] = members
    .filter((member) => member.status === "ACTIVE")
    .map((member) => {
      const profile = getProfile(member.userId);
      const memberExpenses =
        expensesByUserId.get(member.userId) ?? EMPTY_EXPENSES;
      const spent = memberExpenses.reduce(
        (sum, expense) => sum + expense.amount,
        0,
      );
      const latest = memberExpenses[0];
      return {
        id: member.userId,
        nickname: profile?.nickname ?? "알 수 없음",
        avatar: profile?.avatar ?? "🙂",
        detail: latest
          ? `${latest.category} ${formatWon(latest.amount)}`
          : member.isLateJoiner
            ? `${member.joinedDate} 합류`
            : "아직 지출 없음",
        remaining: member.appliedLimit - spent,
        isCrowned: crownIds.includes(member.userId),
        isLateJoiner: member.isLateJoiner,
        isCurrentUser: member.userId === currentUser.id,
      };
    });
  const remainingEffectiveDays = activeChallenge.selectedDates.filter(
    (date) =>
      date >= (currentMember?.joinedDate ?? activeChallenge.startDate) &&
      !activeChallenge.holidayDates.includes(date),
  ).length;

  return (
    <Screen testID="challenge-home-screen">
      <View style={styles.topActions}>
        <Text style={styles.greeting}>
          {currentUser.nickname}님, 이번주도 아껴볼까요?
        </Text>
        <View style={styles.actionButtons}>
          <Pressable
            accessibilityLabel="코드로 참여"
            onPress={() => router.push("/challenge/join")}
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
            onPress={() => router.push("/challenge/create")}
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

      <ChallengeHero
        appliedLimit={appliedLimit}
        baseLimit={activeChallenge.baseLimit}
        daysRemaining={daysRemaining}
        joinLabel={
          currentMember?.isLateJoiner
            ? `${currentMember.joinedDate.slice(5).replace("-", "/")} 중도 합류`
            : "시작 전 합류"
        }
        spent={mySpent}
        title={activeChallenge.name}
      />

      <View style={styles.memberSection} testID="member-list-section">
        <CalculationCard
          appliedLimit={appliedLimit}
          baseLimit={activeChallenge.baseLimit}
          holidayCount={activeChallenge.holidayDates.length}
          joinLabel={
            currentMember?.isLateJoiner ? "중도 합류" : "전체 기간 참여"
          }
          remainingEligibleDays={remainingEffectiveDays}
          totalSelectedDays={activeChallenge.selectedDates.length}
        />
        <MemberList members={memberRows} />
        <View style={styles.memberFooter}>
          <View style={styles.inviteCopy}>
            <Text style={styles.codeLabel}>같이 도전하기</Text>
            <Text style={styles.codeHint}>참여 코드를 공유하세요</Text>
          </View>
          <View
            accessible
            accessibilityLabel={`참여 코드 ${activeChallenge.inviteCode}, 현재 ${memberRows.length}명, 최대 ${activeChallenge.capacity}명`}
            style={styles.codePill}
          >
            <MaterialCommunityIcons
              color={palette.green}
              name="link-variant"
              size={16}
            />
            <Text selectable style={styles.code}>
              {activeChallenge.inviteCode}
            </Text>
            <View style={styles.codeDivider} />
            <Text style={styles.capacity}>
              {memberRows.length}/{activeChallenge.capacity}명
            </Text>
          </View>
        </View>
      </View>

      <PhaseBanner phase={phase} timeline={timeline} />

      <View style={styles.feedHeader}>
        <Text style={styles.sectionTitle}>멤버별 최근 지출</Text>
        {phase === "ACTIVE" || phase === "ADJUSTMENT" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/expense/new")}
            style={styles.addButton}
          >
            <MaterialCommunityIcons
              color={palette.cream}
              name="camera-plus-outline"
              size={18}
            />
            <Text style={styles.addButtonText}>지출</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.memberExpenseList}>
        {memberRows.map((member) => (
          <MemberExpenseDropdown
            expenses={expensesByUserId.get(member.id) ?? EMPTY_EXPENSES}
            getCommentCount={getCommentCount}
            key={member.id}
            member={member}
            onExpensePress={openExpense}
          />
        ))}
      </View>
    </Screen>
  );
}

function PhaseBanner({
  phase,
  timeline,
}: {
  phase: string;
  timeline: { E: number; C: number; F: number };
}) {
  if (phase === "ACTIVE" || phase === "WAITING") return null;
  const copy =
    phase === "ADJUSTMENT"
      ? `보정 중 · ${formatDateLabel(new Date(timeline.C))}까지 기간 내 지출을 수정할 수 있어요.`
      : phase === "SETTLEMENT"
        ? `정산 중 · 지출이 잠겼어요. ${formatDateLabel(new Date(timeline.F))}에 결과가 확정돼요.`
        : "완료된 챌린지예요. 기록은 읽기 전용으로 보관됩니다.";
  return (
    <View style={styles.phaseBanner}>
      <MaterialCommunityIcons
        color={palette.green}
        name="clock-outline"
        size={18}
      />
      <Text style={styles.phaseText}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  kicker: {
    color: palette.green,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
  },
  greeting: {
    color: palette.ink,
    fontSize: 17,
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
    backgroundColor: "rgba(255,255,255,0.52)",
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
  errorText: { color: palette.danger, flex: 1, fontSize: 13 },
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
  codeLabel: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  codeHint: { color: palette.ink, fontSize: 10, marginTop: 3 },
  codePill: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.34)",
  },
  code: {
    color: palette.green,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  codeDivider: {
    width: StyleSheet.hairlineWidth,
    height: 16,
    backgroundColor: "rgba(52,49,40,0.18)",
  },
  capacity: { color: palette.ink, fontSize: 10, fontWeight: "600" },
  phaseBanner: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    padding: spacing.md,
    marginTop: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: "rgba(47,113,93,0.10)",
  },
  phaseText: { color: palette.green, flex: 1, fontSize: 12, lineHeight: 18 },
  feedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  sectionTitle: { color: palette.ink, fontSize: 20, fontWeight: "700" },
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
  addButtonText: { color: palette.cream, fontSize: 13, fontWeight: "700" },
  memberExpenseList: { gap: spacing.sm },
  emptyHeader: { paddingTop: 90, paddingBottom: spacing.xxl },
  emptyTitle: {
    color: palette.ink,
    fontSize: 30,
    lineHeight: 40,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  emptyBody: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: spacing.md,
  },
  emptyActions: { gap: spacing.md },
});
