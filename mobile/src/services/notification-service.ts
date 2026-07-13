import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Challenge } from '@/data/types';
import { createChallengeTimeline } from '@/domain';

const PREFERENCES_KEY = 'jaringoby.notification-preferences.v1';
const CHANNEL_ID = 'challenge-events';

export type NotificationPreferences = {
  challengeEvents: boolean;
  socialEvents: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  challengeEvents: true,
  socialEvents: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!stored) return DEFAULT_NOTIFICATION_PREFERENCES;
  try {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(JSON.parse(stored) as Partial<NotificationPreferences>) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function saveNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '챌린지 상태와 피드백',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#2F715D',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function syncChallengeNotificationSchedule(challenges: readonly Challenge[]): Promise<void> {
  if (Platform.OS === 'web') return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((item) => item.content.data?.source === 'jaringoby-challenge-schedule')
      .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
  );

  const now = Date.now();
  for (const challenge of challenges) {
    const timeline = createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate });
    const events = [
      { at: timeline.S - 10 * 60_000, title: '곧 챌린지가 시작돼요', body: `${challenge.name} 시작 10분 전이에요.` },
      { at: timeline.S, title: '챌린지 시작', body: `${challenge.name} 지출 기록을 시작해 보세요.` },
      { at: timeline.E, title: '보정 시간이 시작됐어요', body: '기간 안의 누락 지출을 내일 낮 12시까지 정리할 수 있어요.' },
      { at: timeline.C - 2 * 60 * 60_000, title: '지출 수정 마감 2시간 전', body: '미동기화 사진과 지출을 지금 확인해 주세요.' },
      { at: timeline.C, title: '정산이 시작됐어요', body: '지출은 잠겼고 댓글과 답글은 계속 남길 수 있어요.' },
      { at: timeline.F, title: '챌린지 결과가 확정됐어요', body: '지난 기록에서 결과와 대화를 다시 볼 수 있어요.' },
    ];
    for (const event of events) {
      if (event.at <= now) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `challenge:${challenge.id}:${event.at}`,
        content: {
          title: event.title,
          body: event.body,
          data: {
            source: 'jaringoby-challenge-schedule',
            challengeId: challenge.id,
            route: '/',
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: event.at,
          channelId: CHANNEL_ID,
        },
      });
    }
  }
}

export async function presentPrivacySafeNotification(input: {
  title: string;
  body: string;
  route: string;
}): Promise<void> {
  if (Platform.OS === 'web') return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      data: { source: 'jaringoby-realtime', route: input.route },
    },
    trigger: null,
  });
}
