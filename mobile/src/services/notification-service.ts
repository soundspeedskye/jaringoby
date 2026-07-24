import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  buildDesiredPeriodNotifications,
  buildPeriodNotificationScheduleDiff,
  LatestValueScheduler,
  PERIOD_NOTIFICATION_SCHEDULE_VERSION,
  PERIOD_NOTIFICATION_SOURCE,
  type PeriodNotificationTarget,
} from '@/services/period-notification-schedule';

const CHANNEL_ID = 'period-events';
const RECONCILE_RETRY_DELAY_MS = 750;
let channelSetupPromise: Promise<void> | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  await ensureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  if (allowsNotifications(current)) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return allowsNotifications(requested);
}

export function requestPeriodNotificationSchedule(
  targets: readonly PeriodNotificationTarget[],
): void {
  periodNotificationScheduler.enqueue([...targets]);
}

export async function reconcilePeriodNotificationSchedule(
  targets: readonly PeriodNotificationTarget[],
  now = Date.now(),
): Promise<void> {
  if (Platform.OS === 'web') return;
  const desired = buildDesiredPeriodNotifications(targets, now);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const managed = scheduled
    .filter((item) => item.content.data?.source === PERIOD_NOTIFICATION_SOURCE)
    .map((item) => ({
      identifier: item.identifier,
      scheduleKey:
        typeof item.content.data?.scheduleKey === 'string'
          ? item.content.data.scheduleKey
          : undefined,
    }));
  const diff = buildPeriodNotificationScheduleDiff(desired, managed);
  const failedScheduleKeys = new Set<string>();
  const errors: unknown[] = [];

  if (diff.missing.length) {
    const permission = await Notifications.getPermissionsAsync();
    if (!allowsNotifications(permission)) return;
    await ensureNotificationChannel();
    const results = await Promise.allSettled(
      diff.missing.map((notification) =>
        Notifications.scheduleNotificationAsync({
          identifier: notification.identifier,
          content: {
            title: notification.title,
            body: notification.body,
            data: {
              source: PERIOD_NOTIFICATION_SOURCE,
              scheduleVersion: PERIOD_NOTIFICATION_SCHEDULE_VERSION,
              scheduleKey: notification.scheduleKey,
              fingerprint: notification.fingerprint,
              periodId: notification.periodId,
              eventKind: notification.eventKind,
              route: notification.route,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notification.at,
            channelId: CHANNEL_ID,
          },
        }),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      failedScheduleKeys.add(diff.missing[index].scheduleKey);
      errors.push(result.reason);
    });
  }

  const cancellableObsolete = diff.obsolete.filter(
    (notification) =>
      failedScheduleKeys.size === 0 ||
      (notification.scheduleKey !== undefined &&
        !failedScheduleKeys.has(notification.scheduleKey)),
  );
  const cancellationResults = await Promise.allSettled(
    cancellableObsolete.map((notification) =>
      Notifications.cancelScheduledNotificationAsync(notification.identifier),
    ),
  );
  cancellationResults.forEach((result) => {
    if (result.status === 'rejected') errors.push(result.reason);
  });
  if (errors.length) {
    throw new Error(`알림 일정 ${errors.length}건을 동기화하지 못했습니다.`);
  }
}

const periodNotificationScheduler = new LatestValueScheduler<
  readonly PeriodNotificationTarget[]
>(
  async (targets) => {
    try {
      await reconcilePeriodNotificationSchedule(targets);
    } catch {
      await delay(RECONCILE_RETRY_DELAY_MS);
      await reconcilePeriodNotificationSchedule(targets);
    }
  },
);

export async function presentPrivacySafeNotification(input: {
  title: string;
  body: string;
  route: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const permission = await Notifications.getPermissionsAsync();
  if (!allowsNotifications(permission)) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: { source: 'jaringoby-realtime', route: input.route },
    },
    trigger: null,
  });
  return true;
}

function allowsNotifications(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  const iosStatus = permission.ios?.status;
  return (
    permission.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!channelSetupPromise) {
    channelSetupPromise = Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '주간 챌린지 상태와 피드백',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#2F715D',
    })
      .then(() => undefined)
      .catch((error) => {
        channelSetupPromise = null;
        throw error;
      });
  }
  await channelSetupPromise;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
