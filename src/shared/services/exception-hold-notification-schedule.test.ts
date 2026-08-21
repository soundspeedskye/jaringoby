import { describe, expect, it } from "vitest";

import type { Period } from "@/shared/api/types";
import {
  buildDesiredExceptionHoldNotifications,
  buildExceptionHoldNotificationScheduleDiff,
} from "@/shared/services/exception-hold-notification-schedule";

const MONDAY_8_AM_KST = Date.parse("2026-08-03T08:00:00+09:00");

describe("exception hold notification schedule", () => {
  it("schedules one 9 AM Seoul reminder each day through the correction cutoff", () => {
    const desired = buildDesiredExceptionHoldNotifications(
      [{ expenseId: "expense-1", period: period() }],
      MONDAY_8_AM_KST,
    );

    expect(desired).toHaveLength(6);
    expect(desired.map((notification) => new Date(notification.at).toISOString()))
      .toEqual([
        "2026-08-03T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
        "2026-08-05T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z",
        "2026-08-07T00:00:00.000Z",
        "2026-08-08T00:00:00.000Z",
      ]);
    expect(desired.every((notification) => notification.route === "/expense/expense-1")).toBe(true);
  });

  it("starts tomorrow after today's reminder time and removes responses no longer on hold", () => {
    const desired = buildDesiredExceptionHoldNotifications(
      [{ expenseId: "expense-1", period: period() }],
      Date.parse("2026-08-03T09:00:00+09:00"),
    );
    expect(desired[0].scheduleKey).toContain("2026-08-04");
    expect(buildExceptionHoldNotificationScheduleDiff([], desired.map(({ identifier }) => ({ identifier }))))
      .toEqual({ missing: [], obsolete: desired.map(({ identifier }) => ({ identifier })) });
  });
});

function period(): Period {
  return {
    id: "period-1",
    roomId: "room-1",
    weekIndex: 1,
    weekStart: "2026-08-03",
    weekEnd: "2026-08-07",
    selectedDayCount: 5,
    validDayCount: 5,
    holidayDates: [],
    holidayVersionId: "test",
    phase: "ACTIVE",
    isRestWeek: false,
    createdAt: "2026-08-03T00:00:00.000Z",
  };
}
