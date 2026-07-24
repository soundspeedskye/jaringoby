import { describe, expect, it, vi } from "vitest";

import type { Period } from "@/data/types";
import {
  buildDesiredPeriodNotifications,
  buildPeriodNotificationScheduleDiff,
  LatestValueScheduler,
  type PeriodNotificationTarget,
} from "@/services/period-notification-schedule";

const BEFORE_PERIOD = Date.parse("2026-08-01T00:00:00.000Z");

describe("buildDesiredPeriodNotifications", () => {
  it("builds six stable future events for an active period", () => {
    const desired = buildDesiredPeriodNotifications(
      [target(createPeriod())],
      BEFORE_PERIOD,
    );

    expect(desired).toHaveLength(6);
    expect(desired.map((item) => item.eventKind)).toEqual([
      "START_WARNING",
      "START",
      "ADJUSTMENT_START",
      "CUTOFF_WARNING",
      "SETTLEMENT",
      "FINALIZED",
    ]);
    expect(new Set(desired.map((item) => item.identifier)).size).toBe(6);
  });

  it("skips rest weeks, archived periods, and elapsed events", () => {
    const restWeek = createPeriod({ id: "rest", isRestWeek: true });
    const archived = createPeriod({ id: "archived", phase: "ARCHIVED" });
    const elapsed = createPeriod({ id: "elapsed", weekStart: "2026-01-05" });

    expect(
      buildDesiredPeriodNotifications(
        [target(restWeek), target(archived), target(elapsed)],
        BEFORE_PERIOD,
      ),
    ).toEqual([]);
  });
});

describe("buildPeriodNotificationScheduleDiff", () => {
  it("does no work when every desired notification already exists", () => {
    const desired = buildDesiredPeriodNotifications(
      [target(createPeriod())],
      BEFORE_PERIOD,
    );

    expect(
      buildPeriodNotificationScheduleDiff(
        desired,
        desired.map(({ identifier }) => ({ identifier })),
      ),
    ).toEqual({ missing: [], obsolete: [] });
  });

  it("replaces only notifications whose content changed", () => {
    const period = createPeriod();
    const before = buildDesiredPeriodNotifications(
      [target(period, "절약방")],
      BEFORE_PERIOD,
    );
    const after = buildDesiredPeriodNotifications(
      [target(period, "새 이름")],
      BEFORE_PERIOD,
    );
    const diff = buildPeriodNotificationScheduleDiff(
      after,
      before.map(({ identifier }) => ({ identifier })),
    );

    expect(diff.missing.map((item) => item.eventKind)).toEqual([
      "START_WARNING",
      "START",
    ]);
    expect(diff.obsolete).toHaveLength(2);
  });

  it("cancels all managed notifications when period events are disabled", () => {
    const desired = buildDesiredPeriodNotifications(
      [target(createPeriod())],
      BEFORE_PERIOD,
    );
    const scheduled = desired.map(({ identifier }) => ({ identifier }));

    expect(
      buildPeriodNotificationScheduleDiff([], scheduled),
    ).toEqual({ missing: [], obsolete: scheduled });
  });
});

describe("LatestValueScheduler", () => {
  it("serializes work and coalesces queued values to the latest request", async () => {
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const task = vi.fn(async (value: number) => {
      if (value === 1) await firstBlocked;
    });
    const scheduler = new LatestValueScheduler(task);

    scheduler.enqueue(1);
    scheduler.enqueue(2);
    scheduler.enqueue(3);
    releaseFirst?.();
    await scheduler.whenIdle();

    expect(task.mock.calls.map(([value]) => value)).toEqual([1, 3]);
  });
});

function target(
  period: Period,
  roomName = "절약방",
): PeriodNotificationTarget {
  return { period, roomName };
}

function createPeriod(patch: Partial<Period> = {}): Period {
  return {
    id: "period-1",
    roomId: "room-1",
    weekIndex: 3,
    weekStart: "2026-08-03",
    weekEnd: "2026-08-07",
    selectedDayCount: 5,
    validDayCount: 5,
    holidayDates: [],
    holidayVersionId: "test",
    phase: "ACTIVE",
    isRestWeek: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  };
}

