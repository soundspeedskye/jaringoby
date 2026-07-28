import type { Period } from "@/data/types";
import { createPeriodTimeline } from "@/domain";

export const PERIOD_NOTIFICATION_SOURCE = "jaringoby-period-schedule";
export const PERIOD_NOTIFICATION_SCHEDULE_VERSION = 2;

export type PeriodNotificationTarget = {
  period: Period;
  roomName: string;
};

export type PeriodNotificationEventKind =
  | "START_WARNING"
  | "START"
  | "ADJUSTMENT_START"
  | "CUTOFF_WARNING"
  | "SETTLEMENT"
  | "FINALIZED";

export type DesiredPeriodNotification = {
  identifier: string;
  scheduleKey: string;
  fingerprint: string;
  periodId: string;
  eventKind: PeriodNotificationEventKind;
  at: number;
  title: string;
  body: string;
  route: string;
};

export type ManagedScheduledNotification = {
  identifier: string;
  scheduleKey?: string;
};

export type PeriodNotificationScheduleDiff = {
  missing: DesiredPeriodNotification[];
  obsolete: ManagedScheduledNotification[];
};

export function buildDesiredPeriodNotifications(
  targets: readonly PeriodNotificationTarget[],
  now: number,
): DesiredPeriodNotification[] {
  const desired: DesiredPeriodNotification[] = [];
  targets.forEach(({ period, roomName }) => {
    if (period.phase === "ARCHIVED" || period.isRestWeek) return;
    const timeline = createPeriodTimeline(period.weekStart);
    const weekLabel = `${roomName} ${period.weekIndex}주차`;
    const events: {
      eventKind: PeriodNotificationEventKind;
      at: number;
      title: string;
      body: string;
    }[] = [
      {
        eventKind: "START_WARNING",
        at: timeline.S - 10 * 60_000,
        title: "곧 이번 주 챌린지가 시작돼요",
        body: `${weekLabel} 시작 10분 전이에요.`,
      },
      {
        eventKind: "START",
        at: timeline.S,
        title: "이번 주 챌린지 시작",
        body: `${weekLabel} 지출 기록을 시작해 보세요.`,
      },
      {
        eventKind: "ADJUSTMENT_START",
        at: timeline.E,
        title: "보정 시간이 시작됐어요",
        body: "이번 주 누락 지출을 오늘 낮 12시까지 정리할 수 있어요.",
      },
      {
        eventKind: "CUTOFF_WARNING",
        at: timeline.C - 2 * 60 * 60_000,
        title: "지출 수정 마감 2시간 전",
        body: "미동기화 사진과 지출을 지금 확인해 주세요.",
      },
      {
        eventKind: "SETTLEMENT",
        at: timeline.C,
        title: "정산이 시작됐어요",
        body: "지출은 잠겼고 댓글과 답글은 계속 남길 수 있어요.",
      },
      {
        eventKind: "FINALIZED",
        at: timeline.F,
        title: "이번 주 결과가 확정됐어요",
        body: "지난 주차에서 결과와 누적 기록을 확인할 수 있어요.",
      },
    ];
    events.forEach((event) => {
      if (event.at <= now) return;
      const scheduleKey = `period:${period.id}:${event.eventKind}`;
      const fingerprint = createFingerprint([
        PERIOD_NOTIFICATION_SCHEDULE_VERSION,
        scheduleKey,
        event.at,
        event.title,
        event.body,
        "/",
      ]);
      desired.push({
        ...event,
        identifier: `${scheduleKey}:${fingerprint}`,
        scheduleKey,
        fingerprint,
        periodId: period.id,
        route: "/",
      });
    });
  });
  return desired.sort(
    (left, right) =>
      left.at - right.at || left.identifier.localeCompare(right.identifier),
  );
}

export function buildPeriodNotificationScheduleDiff(
  desired: readonly DesiredPeriodNotification[],
  scheduled: readonly ManagedScheduledNotification[],
): PeriodNotificationScheduleDiff {
  const desiredIdentifiers = new Set(
    desired.map((notification) => notification.identifier),
  );
  const scheduledIdentifiers = new Set(
    scheduled.map((notification) => notification.identifier),
  );
  return {
    missing: desired.filter(
      (notification) => !scheduledIdentifiers.has(notification.identifier),
    ),
    obsolete: scheduled.filter(
      (notification) => !desiredIdentifiers.has(notification.identifier),
    ),
  };
}

export class LatestValueScheduler<T> {
  private running = false;
  private hasPending = false;
  private pending!: T;
  private readonly idleResolvers = new Set<() => void>();

  constructor(
    private readonly task: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  enqueue(value: T): void {
    this.pending = value;
    this.hasPending = true;
    if (!this.running) void this.drain();
  }

  whenIdle(): Promise<void> {
    if (!this.running && !this.hasPending) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleResolvers.add(resolve);
    });
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.hasPending) {
      const value = this.pending;
      this.hasPending = false;
      try {
        await this.task(value);
      } catch (error) {
        this.onError(error);
      }
    }
    this.running = false;
    this.idleResolvers.forEach((resolve) => resolve());
    this.idleResolvers.clear();
  }
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
