import type {
  Comment,
  Expense,
  RoomMember,
} from "@/data/types";
import {
  shallowEqual,
  useAppStoreSelector,
} from "@/providers/app-store-provider";
import type { PeriodNotificationTarget } from "@/services/period-notification-schedule";
import type { AppStoreState } from "@/store/app-store";

const EMPTY_TARGETS: PeriodNotificationTarget[] = [];

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

export function usePeriodNotificationTargets(): PeriodNotificationTarget[] {
  return useAppStoreSelector(
    selectPeriodNotificationTargets,
    periodNotificationTargetsEqual,
  );
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
