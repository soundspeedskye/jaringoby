import type { Period } from "@/shared/api/types";
import { addLocalDays, startOfSeoulDate, toSeoulLocalDate } from "@/shared/lib/domain/date-time";
import { createPeriodTimeline } from "@/shared/lib/domain/period";

export const EXCEPTION_HOLD_NOTIFICATION_SOURCE = "jaringoby-exception-hold";
export const EXCEPTION_HOLD_NOTIFICATION_SCHEDULE_VERSION = 1;
const REMINDER_HOUR_SEOUL = 9;

export type ExceptionHoldNotificationTarget = {
  expenseId: string;
  period: Period;
};

export type DesiredExceptionHoldNotification = {
  identifier: string;
  scheduleKey: string;
  fingerprint: string;
  at: number;
  expenseId: string;
  route: string;
  title: string;
  body: string;
};

export type ManagedScheduledNotification = {
  identifier: string;
  scheduleKey?: string;
};

export function buildDesiredExceptionHoldNotifications(
  targets: readonly ExceptionHoldNotificationTarget[],
  now: number,
): DesiredExceptionHoldNotification[] {
  const desired: DesiredExceptionHoldNotification[] = [];
  targets.forEach(({ expenseId, period }) => {
    const cutoffAt = createPeriodTimeline(period.weekStart).C;
    let reminderDate = toSeoulLocalDate(now);
    let reminderAt = atSeoulHour(reminderDate, REMINDER_HOUR_SEOUL);
    if (reminderAt <= now) {
      reminderDate = addLocalDays(reminderDate, 1);
      reminderAt = atSeoulHour(reminderDate, REMINDER_HOUR_SEOUL);
    }
    while (reminderAt < cutoffAt) {
      const scheduleKey = `exception-hold:${expenseId}:${reminderDate}`;
      const title = "보류한 예외 요청이 있어요";
      const body = "주차 마감 전 승인 여부를 결정해 주세요.";
      const fingerprint = createFingerprint([
        EXCEPTION_HOLD_NOTIFICATION_SCHEDULE_VERSION,
        scheduleKey,
        reminderAt,
        title,
        body,
        `/expense/${expenseId}`,
      ]);
      desired.push({
        identifier: `${scheduleKey}:${fingerprint}`,
        scheduleKey,
        fingerprint,
        at: reminderAt,
        expenseId,
        route: `/expense/${expenseId}`,
        title,
        body,
      });
      reminderDate = addLocalDays(reminderDate, 1);
      reminderAt = atSeoulHour(reminderDate, REMINDER_HOUR_SEOUL);
    }
  });
  return desired.sort((left, right) => left.at - right.at || left.identifier.localeCompare(right.identifier));
}

export function buildExceptionHoldNotificationScheduleDiff(
  desired: readonly DesiredExceptionHoldNotification[],
  scheduled: readonly ManagedScheduledNotification[],
): { missing: DesiredExceptionHoldNotification[]; obsolete: ManagedScheduledNotification[] } {
  const desiredIdentifiers = new Set(desired.map((notification) => notification.identifier));
  const scheduledIdentifiers = new Set(scheduled.map((notification) => notification.identifier));
  return {
    missing: desired.filter((notification) => !scheduledIdentifiers.has(notification.identifier)),
    obsolete: scheduled.filter((notification) => !desiredIdentifiers.has(notification.identifier)),
  };
}

function atSeoulHour(date: string, hour: number): number {
  return startOfSeoulDate(date) + hour * 60 * 60_000;
}

function createFingerprint(values: readonly (string | number)[]): string {
  const input = values.join("\u001f");
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
