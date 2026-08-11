import { useRouter } from "expo-router";
import { useMemo } from "react";

import type { MemberListItem } from "@/components/room/member-list";
import type { WeekDay } from "@/components/room/room-hero";
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
  createPeriodTimeline,
  createWeekdayCalendarFromPeriod,
  getPeriodPhase,
  startOfSeoulDate,
  toSeoulLocalDate,
  type PeriodPhase,
  type PeriodTimeline,
} from "@/domain";
import {
  useCommentCounts,
  useCrownIds,
  useCurrentRoom,
  usePeriodExpenses,
  usePeriodMembers,
  useProfiles,
  useSettlementExcludedExpenseIds,
} from "@/providers/app-data-hooks";
import { useAppStatus, useAppStatusActions } from "@/providers/app-status-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { formatMonthDay, formatWon } from "@/utils/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMPTY_EXPENSES: Expense[] = [];

/** Everything the loaded home view renders, derived from the current room state. */
export type RoomHomeData = {
  activeRoom: Room;
  currentPeriod: Period;
  currentUser: Profile;
  currentMember: PeriodMember | undefined;
  appliedLimit: number;
  daysRemaining: number;
  mySpent: number;
  myPendingDelta: number;
  myPendingCount: number;
  phase: PeriodPhase;
  timeline: PeriodTimeline;
  weekMonthLabel: string;
  weekDays: WeekDay[];
  weekRangeLabel: string;
  memberRows: MemberListItem[];
  expensesByUserId: ReadonlyMap<string, Expense[]>;
  commentCounts: ReadonlyMap<string, number>;
  error: string | null;
};

/** Navigation and status callbacks shared across every home view state. */
export type RoomHomeActions = {
  addExpense: () => void;
  joinRoom: () => void;
  createRoom: () => void;
  clearError: () => void;
  retry: () => void;
  onOpenExpense: (expenseId: string) => void;
};

export type RoomHomeState =
  | { status: "loading" }
  | { status: "empty"; error: string | null }
  | { status: "ready"; data: RoomHomeData };

export function useRoomHome(): { state: RoomHomeState; actions: RoomHomeActions } {
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
  const excludedExpenseIds = useSettlementExcludedExpenseIds();
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
          (sum, expense) =>
            excludedExpenseIds.has(expense.id)
              ? sum
              : sum + expenseOfficialAmount(expense),
          0,
        );
        const latestCreatedExpense = memberExpenses[0];
        return {
          id: member.userId,
          nickname: profile?.nickname ?? "알 수 없음",
          avatar: profile?.avatar ?? "",
          avatarUri: profile?.avatarUri,
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
  }, [crownIds, currentUser, excludedExpenseIds, expensesByUserId, members, profilesById]);

  const actions = useMemo<RoomHomeActions>(
    () => ({
      addExpense: () => router.push("/expense/new"),
      joinRoom: () => router.push("/room/join"),
      createRoom: () => router.push("/room/create"),
      clearError,
      retry: () => void refresh(),
      onOpenExpense: (expenseId: string) => router.push(`/expense/${expenseId}`),
    }),
    [clearError, refresh, router],
  );

  const state = useMemo<RoomHomeState>(() => {
    if (loading) return { status: "loading" };
    if (!activeRoom || !currentPeriod || !currentUser || !timeline) {
      return { status: "empty", error };
    }

    const phase = getPeriodPhase(timeline, now);
    const currentMember = members.find(
      (member) => member.userId === currentUser.id,
    );
    const myExpenses = expenses.filter(
      (expense) => expense.userId === currentUser.id,
    );
    const mySpent = myExpenses.reduce(
      (sum, expense) =>
        excludedExpenseIds.has(expense.id) ? sum : sum + expenseOfficialAmount(expense),
      0,
    );
    const myPendingDelta = myExpenses.reduce(
      (sum, expense) => sum + expensePendingDelta(expense),
      0,
    );
    const myPendingCount = myExpenses.filter((expense) =>
      hasPendingExpenseProjection(expense),
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
    // 참여 시작일: 중도 합류면 합류일부터, 전체 참여면 주 시작일부터. 비멤버면 참여 없음.
    const participationStart = currentMember
      ? currentMember.isLateJoiner
        ? currentMember.joinedDate
        : currentPeriod.weekStart
      : null;
    const weekMonthLabel = `${Number(currentPeriod.weekStart.slice(5, 7))}월`;
    const weekDays: WeekDay[] = createWeekdayCalendarFromPeriod(
      currentPeriod,
    ).days.map((periodDay) => ({
      day: Number(periodDay.date.slice(8, 10)),
      participating:
        participationStart != null &&
        periodDay.date >= participationStart &&
        !periodDay.isHoliday,
      isHoliday: periodDay.isHoliday,
      isToday: periodDay.date === today,
    }));
    const weekRangeLabel = currentMember
      ? currentMember.isLateJoiner
        ? `${formatMonthDay(currentMember.joinedDate)}부터 ${formatMonthDay(currentPeriod.weekEnd)}까지 참여`
        : "이번 주 전체 참여"
      : "다음 주부터 참여";

    return {
      status: "ready",
      data: {
        activeRoom,
        currentPeriod,
        currentUser,
        currentMember,
        appliedLimit,
        daysRemaining,
        mySpent,
        myPendingDelta,
        myPendingCount,
        phase,
        timeline,
        weekMonthLabel,
        weekDays,
        weekRangeLabel,
        memberRows,
        expensesByUserId: sectionExpensesByUserId,
        commentCounts,
        error,
      },
    };
  }, [
    activeRoom,
    commentCounts,
    currentPeriod,
    currentUser,
    error,
    excludedExpenseIds,
    expenses,
    loading,
    memberRows,
    members,
    now,
    sectionExpensesByUserId,
    timeline,
  ]);

  return { state, actions };
}
