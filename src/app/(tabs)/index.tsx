import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";

import {
  MemberExpenseRow,
  MemberExpenseSectionFooter,
  MemberExpenseSectionHeader,
} from "@/components/expense/member-expense-section";
import { CalculationCard } from "@/components/room/calculation-card";
import { RoomHero } from "@/components/room/room-hero";
import {
  MemberList,
  type MemberListItem,
} from "@/components/room/member-list";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen, ScreenFrame } from "@/components/ui/screen";
import { SectionHeader } from "@/components/ui/section-header";
import { palette, radii, shadow, spacing } from "@/constants/design";
import {
  expenseOfficialAmount,
  expensePendingDelta,
  hasPendingExpenseProjection,
} from "@/data/expense-sync";
import type {
  Expense,
  Period,
  PeriodMember,
  Profile,
  Room,
} from "@/data/types";
import {
  addLocalDays,
  countRemainingEligibleDays,
  createPeriodTimeline,
  createWeekdayCalendarFromPeriod,
  getPeriodPhase,
  isExpenseMutationPhase,
  startOfSeoulDate,
  toSeoulLocalDate,
  type PeriodPhase,
} from "@/domain";
import {
  useCommentCounts,
  useCrownIds,
  useCurrentRoom,
  usePeriodExpenses,
  usePeriodMembers,
  useProfiles,
} from "@/providers/app-data-hooks";
import { useAppStatus, useAppStatusActions } from "@/providers/app-status-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { formatDateLabel, formatWon } from "@/utils/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_EXPENSES: Expense[] = [];
type MemberExpenseSectionData = {
  key: string;
  member: MemberListItem;
  expenses: Expense[];
  expanded: boolean;
  data: Expense[];
};

export default function RoomHomeScreen() {
  const router = useRouter();
  const { activeRoom, currentPeriod, currentUser } = useCurrentRoom();
  const { error, loading } = useAppStatus();
  const { clearError, refresh } = useAppStatusActions();
  const members = usePeriodMembers(currentPeriod?.id);
  const periodExpenses = usePeriodExpenses(currentPeriod?.id);
  const memberUserIds = useMemo(
    () => members.map((member) => member.userId),
    [members],
  );
  const profilesById = useProfiles(memberUserIds);
  const expenses = useMemo(
    () => [...periodExpenses].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    ),
    [periodExpenses],
  );
  const commentCounts = useCommentCounts(expenses);
  const crownIds = useCrownIds(currentPeriod?.id);
  const expensesByUserId = useMemo(() => {
    const grouped = new Map<string, Expense[]>();
    expenses.forEach((expense) => {
      const memberExpenses = grouped.get(expense.userId);
      if (memberExpenses) memberExpenses.push(expense);
      else grouped.set(expense.userId, [expense]);
    });
    return grouped;
  }, [expenses]);
  const sectionExpensesByUserId = useMemo(() => {
    const sorted = new Map<string, Expense[]>();
    expensesByUserId.forEach((memberExpenses, userId) => {
      sorted.set(userId, [...memberExpenses].sort((a, b) => {
        const occurredAtDifference =
          Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
        return (
          occurredAtDifference ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt)
        );
      }));
    });
    return sorted;
  }, [expensesByUserId]);
  const openExpense = useCallback(
    (expenseId: string) => router.push(`/expense/${expenseId}`),
    [router],
  );
  const joinRoom = useCallback(() => router.push("/room/join"), [router]);
  const createRoom = useCallback(() => router.push("/room/create"), [router]);
  const addExpense = useCallback(() => router.push("/expense/new"), [router]);
  const timeline = useMemo(
    () => (currentPeriod ? createPeriodTimeline(currentPeriod.weekStart) : null),
    [currentPeriod],
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
  const memberRows = useMemo<MemberListItem[]>(() => {
    if (!currentUser) return [];
    return members
      .filter((member) => member.status === "ACTIVE")
      .map((member) => {
        const profile = profilesById.get(member.userId);
        const memberExpenses =
          expensesByUserId.get(member.userId) ?? EMPTY_EXPENSES;
        const spent = memberExpenses.reduce(
          (sum, expense) => sum + expenseOfficialAmount(expense),
          0,
        );
        const latestCreatedExpense = memberExpenses[0];
        return {
          id: member.userId,
          nickname: profile?.nickname ?? "알 수 없음",
          avatar: profile?.avatar ?? "🙂",
          detail: latestCreatedExpense
            ? `${latestCreatedExpense.category} ${formatWon(latestCreatedExpense.amount)}`
            : member.isLateJoiner
              ? `${member.joinedDate} 합류`
              : "아직 지출 없음",
          remaining: member.appliedLimit - spent,
          isCrowned: crownIds.includes(member.userId),
          isLateJoiner: member.isLateJoiner,
          isCurrentUser: member.userId === currentUser.id,
        };
      });
  }, [crownIds, currentUser, expensesByUserId, members, profilesById]);
  // Rendered by every branch below: a failed initial load leaves activeRoom
  // and currentUser empty, so an error shown only by the loaded view is invisible
  // exactly when it matters most.
  const errorBanner = error ? (
    <Pressable
      accessibilityRole="alert"
      onPress={clearError}
      style={styles.errorBanner}
    >
      <Text style={styles.errorText}>{error}</Text>
      <MaterialCommunityIcons color={palette.danger} name="close" size={18} />
    </Pressable>
  ) : null;

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.green} size="large" />
        </View>
      </Screen>
    );
  }

  if (!activeRoom || !currentPeriod || !currentUser || !timeline) {
    return (
      <Screen>
        {errorBanner}
        <View style={styles.emptyHeader}>
          <Text style={styles.kicker}>JARINGOBY</Text>
          <Text style={styles.emptyTitle}>
            {error
              ? "기록을 불러오지 못했어요."
              : "함께하면 더 오래 지킬 수 있어요."}
          </Text>
          <Text style={styles.emptyBody}>
            {error
              ? "네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요. 아직 저장되지 않은 기록은 이 기기에 남아 있어요."
              : "주당 기준금액을 정하고 친구를 초대하면 매주 평일 챌린지가 자동으로 열려요."}
          </Text>
        </View>
        <View style={styles.emptyActions}>
          {error ? (
            <PrimaryButton label="다시 시도" onPress={() => void refresh()} />
          ) : null}
          <PrimaryButton
            label="방 만들기"
            onPress={() => router.push("/room/create")}
            variant={error ? "secondary" : "primary"}
          />
          <PrimaryButton
            label="참여 코드 입력"
            onPress={() => router.push("/room/join")}
            variant="secondary"
          />
        </View>
      </Screen>
    );
  }

  const phase = getPeriodPhase(timeline, now);
  const currentMember = members.find(
    (member) => member.userId === currentUser.id,
  );
  const mySpent = expenses
    .filter((expense) => expense.userId === currentUser.id)
    .reduce((sum, expense) => sum + expenseOfficialAmount(expense), 0);
  const myPendingDelta = expenses
    .filter((expense) => expense.userId === currentUser.id)
    .reduce((sum, expense) => sum + expensePendingDelta(expense), 0);
  const myPendingCount = expenses.filter(
    (expense) => expense.userId === currentUser.id && hasPendingExpenseProjection(expense),
  ).length;
  const appliedLimit = currentMember?.appliedLimit ?? activeRoom.baseAmount;
  const today = toSeoulLocalDate(now);
  const daysRemaining = Math.max(
    0,
    Math.round(
      (startOfSeoulDate(currentPeriod.weekEnd) - startOfSeoulDate(today)) /
        DAY_MS,
    ),
  );
  const periodCalendar = createWeekdayCalendarFromPeriod(currentPeriod);
  const remainingEffectiveDays = countRemainingEligibleDays(
    periodCalendar,
    currentMember?.joinedDate ?? currentPeriod.weekStart,
  );

  return (
    <ScreenFrame testID="room-home-screen">
      <MemberExpenseList
        activeRoom={activeRoom}
        addExpense={addExpense}
        appliedLimit={appliedLimit}
        clearError={clearError}
        commentCounts={commentCounts}
        createRoom={createRoom}
        currentMember={currentMember}
        currentPeriod={currentPeriod}
        currentUser={currentUser}
        daysRemaining={daysRemaining}
        error={error}
        expensesByUserId={sectionExpensesByUserId}
        joinRoom={joinRoom}
        memberRows={memberRows}
        myPendingCount={myPendingCount}
        myPendingDelta={myPendingDelta}
        mySpent={mySpent}
        onOpenExpense={openExpense}
        phase={phase}
        remainingEffectiveDays={remainingEffectiveDays}
        timeline={timeline}
      />
    </ScreenFrame>
  );
}

const MemberExpenseList = memo(function MemberExpenseList({
  activeRoom,
  addExpense,
  appliedLimit,
  clearError,
  commentCounts,
  createRoom,
  currentMember,
  currentPeriod,
  currentUser,
  daysRemaining,
  error,
  expensesByUserId,
  joinRoom,
  memberRows,
  myPendingCount,
  myPendingDelta,
  mySpent,
  onOpenExpense,
  phase,
  remainingEffectiveDays,
  timeline,
}: {
  activeRoom: Room;
  addExpense: () => void;
  appliedLimit: number;
  clearError: () => void;
  commentCounts: ReadonlyMap<string, number>;
  createRoom: () => void;
  currentMember: PeriodMember | undefined;
  currentPeriod: Period;
  currentUser: Profile;
  daysRemaining: number;
  error: string | null;
  expensesByUserId: ReadonlyMap<string, Expense[]>;
  joinRoom: () => void;
  memberRows: MemberListItem[];
  myPendingCount: number;
  myPendingDelta: number;
  mySpent: number;
  onOpenExpense: (expenseId: string) => void;
  phase: PeriodPhase;
  remainingEffectiveDays: number;
  timeline: ReturnType<typeof createPeriodTimeline>;
}) {
  const [expandedMemberIds, setExpandedMemberIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const toggleMemberExpenses = useCallback((memberId: string) => {
    setExpandedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }, []);
  const memberSections = useMemo<MemberExpenseSectionData[]>(
    () =>
      memberRows.map((member) => {
        const memberExpenses =
          expensesByUserId.get(member.id) ?? EMPTY_EXPENSES;
        const expanded = expandedMemberIds.has(member.id);
        return {
          key: member.id,
          member,
          expenses: memberExpenses,
          expanded,
          data: expanded ? memberExpenses : EMPTY_EXPENSES,
        };
      }),
    [expandedMemberIds, expensesByUserId, memberRows],
  );
  const renderMemberExpense = useCallback(
    ({
      item: expense,
      section,
    }: SectionListRenderItemInfo<Expense, MemberExpenseSectionData>) => (
      <MemberExpenseRow
        avatar={section.member.avatar}
        commentCount={commentCounts.get(expense.id) ?? 0}
        displayName={
          section.member.isCurrentUser ? "나" : section.member.nickname
        }
        expense={expense}
        isCrowned={section.member.isCrowned}
        onPress={onOpenExpense}
      />
    ),
    [commentCounts, onOpenExpense],
  );
  const renderMemberSectionFooter = useCallback(
    ({ section }: { section: MemberExpenseSectionData }) => (
      <MemberExpenseSectionFooter
        expanded={section.expanded}
        hasExpenses={section.expenses.length > 0}
        member={section.member}
      />
    ),
    [],
  );
  const renderMemberSectionHeader = useCallback(
    ({ section }: { section: MemberExpenseSectionData }) => (
      <MemberExpenseSectionHeader
        expanded={section.expanded}
        expenses={section.expenses}
        member={section.member}
        onToggle={toggleMemberExpenses}
      />
    ),
    [toggleMemberExpenses],
  );

  return (
    <SectionList
      contentContainerStyle={styles.content}
      keyExtractor={(expense) => expense.id}
      ListHeaderComponent={
        <RoomHomeHeader
          activeRoom={activeRoom}
          addExpense={addExpense}
          appliedLimit={appliedLimit}
          clearError={clearError}
          createRoom={createRoom}
          currentMember={currentMember}
          currentPeriod={currentPeriod}
          currentUser={currentUser}
          daysRemaining={daysRemaining}
          error={error}
          joinRoom={joinRoom}
          memberRows={memberRows}
          myPendingCount={myPendingCount}
          myPendingDelta={myPendingDelta}
          mySpent={mySpent}
          phase={phase}
          remainingEffectiveDays={remainingEffectiveDays}
          timeline={timeline}
        />
      }
      renderItem={renderMemberExpense}
      renderSectionFooter={renderMemberSectionFooter}
      renderSectionHeader={renderMemberSectionHeader}
      sections={memberSections}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
    />
  );
});

const RoomHomeHeader = memo(function RoomHomeHeader({
  activeRoom,
  addExpense,
  appliedLimit,
  clearError,
  createRoom,
  currentMember,
  currentPeriod,
  currentUser,
  daysRemaining,
  error,
  joinRoom,
  memberRows,
  myPendingCount,
  myPendingDelta,
  mySpent,
  phase,
  remainingEffectiveDays,
  timeline,
}: {
  activeRoom: Room;
  addExpense: () => void;
  appliedLimit: number;
  clearError: () => void;
  createRoom: () => void;
  currentMember: PeriodMember | undefined;
  currentPeriod: Period;
  currentUser: Profile;
  daysRemaining: number;
  error: string | null;
  joinRoom: () => void;
  memberRows: MemberListItem[];
  myPendingCount: number;
  myPendingDelta: number;
  mySpent: number;
  phase: PeriodPhase;
  remainingEffectiveDays: number;
  timeline: ReturnType<typeof createPeriodTimeline>;
}) {
  return (
    <>
      <View style={styles.topActions}>
        <Text style={styles.greeting}>
          {currentUser.nickname}님, 이번주도 아껴볼까요?
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
          <MaterialCommunityIcons color={palette.danger} name="close" size={18} />
        </Pressable>
      ) : null}

      <RoomHero
        appliedLimit={appliedLimit}
        baseLimit={activeRoom.baseAmount}
        daysRemaining={daysRemaining}
        joinLabel={
          currentMember
            ? currentMember.isLateJoiner
              ? `${currentMember.joinedDate.slice(5).replace("-", "/")} 중도 합류`
              : "이번 주 전체 참여"
            : "다음 주부터 참여"
        }
        pendingDelta={myPendingDelta}
        pendingCount={myPendingCount}
        spent={mySpent}
        title={`${activeRoom.name} · ${currentPeriod.weekIndex}주차`}
      />

      <View style={styles.memberSection} testID="member-list-section">
        <CalculationCard
          appliedLimit={appliedLimit}
          baseLimit={activeRoom.baseAmount}
          holidayCount={currentPeriod.holidayDates.length}
          joinLabel={
            currentMember?.isLateJoiner ? "중도 합류" : "이번 주 전체 참여"
          }
          remainingEligibleDays={remainingEffectiveDays}
          totalSelectedDays={currentPeriod.selectedDayCount}
        />
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
          !currentPeriod.isRestWeek
          && currentMember
          && isExpenseMutationPhase(phase) ? (
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
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
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
  addButtonText: { color: palette.cream, fontSize: 13, fontWeight: "700" },
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
