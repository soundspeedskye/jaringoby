import type {
  Comment,
  Expense,
  RoomMember,
} from "@/shared/api/types";
import {
  shallowEqual,
  useAppStoreSelector,
} from "@/shared/providers/app-store-provider";
import type { PeriodNotificationTarget } from "@/shared/services/period-notification-schedule";
import type { ExceptionHoldNotificationTarget } from "@/shared/services/exception-hold-notification-schedule";
import type { AppStoreState } from "@/shared/model/app-store";

const EMPTY_TARGETS: PeriodNotificationTarget[] = [];
const EMPTY_EXCEPTION_HOLD_TARGETS: ExceptionHoldNotificationTarget[] = [];

export type SocialNotificationSnapshot = {
  currentUserId: string;
  comments: Comment[];
  expenses: Expense[];
  roomMembers: RoomMember[];
};

const selectPeriodNotificationTargets = (
  state: AppStoreState,
): PeriodNotificationTarget[] => {
  const snapshot = state.snapshot;
  if (!snapshot) return EMPTY_TARGETS;
  return snapshot.periods
    .filter((period) => period.phase !== "ARCHIVED")
    .map((period) => ({
      period,
      roomName: state.indexes.roomById.get(period.roomId)?.name ?? "내 방",
    }));
};

const selectSocialNotificationSnapshot = (
  state: AppStoreState,
): SocialNotificationSnapshot | null => {
  const snapshot = state.snapshot;
  if (!snapshot) return null;
  return {
    currentUserId: snapshot.currentUserId,
    comments: snapshot.comments,
    expenses: snapshot.expenses,
    roomMembers: snapshot.roomMembers,
  };
};

const selectExceptionHoldNotificationTargets = (
  state: AppStoreState,
): ExceptionHoldNotificationTarget[] => {
  const snapshot = state.snapshot;
  if (!snapshot) return EMPTY_EXCEPTION_HOLD_TARGETS;
  const targets: ExceptionHoldNotificationTarget[] = [];
  snapshot.expenseExceptionResponses.forEach((response) => {
    if (response.userId !== snapshot.currentUserId || response.decision !== "HELD") return;
    const exception = state.indexes.exceptionByExpenseId.get(response.expenseId);
    const expense = state.indexes.expenseById.get(response.expenseId);
    if (!exception || !expense?.periodId || exception.requestedBy === snapshot.currentUserId) return;
    const period = state.indexes.periodById.get(expense.periodId);
    const currentMember = period
      ? (state.indexes.membersByPeriodId.get(period.id) ?? []).find(
        (member) => member.userId === snapshot.currentUserId,
      )
      : undefined;
    if (!period || currentMember?.status !== "ACTIVE") return;
    if (period.phase !== "ACTIVE" && period.phase !== "ADJUSTMENT") return;
    targets.push({ expenseId: expense.id, period });
  });
  return targets.length ? targets : EMPTY_EXCEPTION_HOLD_TARGETS;
};

export function usePeriodNotificationTargets(): PeriodNotificationTarget[] {
  return useAppStoreSelector(
    selectPeriodNotificationTargets,
    periodNotificationTargetsEqual,
  );
}

export function useExceptionHoldNotificationTargets(): ExceptionHoldNotificationTarget[] {
  return useAppStoreSelector(selectExceptionHoldNotificationTargets, exceptionHoldTargetsEqual);
}

export function useSocialNotificationSnapshot(): SocialNotificationSnapshot | null {
  return useAppStoreSelector(selectSocialNotificationSnapshot, shallowEqual);
}

function periodNotificationTargetsEqual(
  left: readonly PeriodNotificationTarget[],
  right: readonly PeriodNotificationTarget[],
): boolean {
  return (
    left === right ||
    (left.length === right.length &&
      left.every((target, index) => {
        const next = right[index];
        const period = target.period;
        const nextPeriod = next.period;
        return (
          period.id === nextPeriod.id &&
          period.roomId === nextPeriod.roomId &&
          period.weekStart === nextPeriod.weekStart &&
          period.weekIndex === nextPeriod.weekIndex &&
          period.isRestWeek === nextPeriod.isRestWeek &&
          target.roomName === next.roomName
        );
      }))
  );
}

function exceptionHoldTargetsEqual(
  left: readonly ExceptionHoldNotificationTarget[],
  right: readonly ExceptionHoldNotificationTarget[],
): boolean {
  return left === right || (
    left.length === right.length && left.every((target, index) => (
      target.expenseId === right[index].expenseId && target.period.id === right[index].period.id
    ))
  );
}
