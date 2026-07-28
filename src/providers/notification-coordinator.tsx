import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  usePeriodNotificationTargets,
  useSocialNotificationSnapshot,
  type SocialNotificationSnapshot,
} from '@/providers/notification-data-hooks';
import {
  NotificationDeliveryQueue,
  type NotificationDeliveryJob,
} from '@/services/notification-delivery-queue';
import { useNotificationPreferences } from '@/services/notification-preferences-store';
import {
  presentPrivacySafeNotification,
  requestPeriodNotificationSchedule,
} from '@/services/notification-service';

export function NotificationCoordinator({ children }: PropsWithChildren) {
  const router = useRouter();
  const periodTargets = usePeriodNotificationTargets();
  const socialSnapshot = useSocialNotificationSnapshot();
  const { preferences, ready } = useNotificationPreferences();
  const previousSocialSnapshot = useRef<SocialNotificationSnapshot | null>(null);
  const [socialDeliveryQueue] = useState(
    () =>
      new NotificationDeliveryQueue(async (job) => {
        const delivered = await presentPrivacySafeNotification(job);
        if (!delivered) throw new Error('알림 권한이 없습니다.');
      }),
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
    });
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        const route = response?.notification.request.content.data?.route;
        if (typeof route === 'string' && route.startsWith('/')) router.replace(route as never);
      })
      .catch(() => undefined);
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    const reconcile = () => {
      requestPeriodNotificationSchedule(
        preferences.periodEvents ? periodTargets : [],
      );
      socialDeliveryQueue.retryPending();
    };
    reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcile();
    });
    return () => subscription.remove();
  }, [
    periodTargets,
    preferences.periodEvents,
    ready,
    socialDeliveryQueue,
  ]);

  useEffect(() => {
    if (!ready || !socialSnapshot) return;
    const before = previousSocialSnapshot.current;
    previousSocialSnapshot.current = socialSnapshot;
    if (!preferences.socialEvents) {
      socialDeliveryQueue.clear();
      return;
    }
    if (
      Platform.OS === 'web' ||
      !before
    ) return;
    socialDeliveryQueue.enqueue(
      buildSocialNotificationJobs(before, socialSnapshot),
    );
  }, [
    preferences.socialEvents,
    ready,
    socialDeliveryQueue,
    socialSnapshot,
  ]);

  useEffect(
    () => () => {
      socialDeliveryQueue.dispose();
    },
    [socialDeliveryQueue],
  );

  return children;
}

export function buildSocialNotificationJobs(
  before: SocialNotificationSnapshot,
  after: SocialNotificationSnapshot,
): NotificationDeliveryJob[] {
  const jobs: NotificationDeliveryJob[] = [];
  const oldCommentIds = new Set(before.comments.map((comment) => comment.id));
  const ownExpenseIds = new Set(
    after.expenses.filter((expense) => expense.userId === after.currentUserId).map((expense) => expense.id),
  );
  const ownCommentIds = new Set(
    after.comments.filter((comment) => comment.userId === after.currentUserId).map((comment) => comment.id),
  );
  const newRelevantComment = after.comments.find(
    (comment) =>
      !oldCommentIds.has(comment.id) &&
      comment.userId !== after.currentUserId &&
      (ownExpenseIds.has(comment.expenseId) || Boolean(comment.replyToId && ownCommentIds.has(comment.replyToId))),
  );
  if (newRelevantComment) {
    jobs.push({
      id: `comment:${newRelevantComment.id}`,
      title: newRelevantComment.replyToId ? '새 답글이 도착했어요' : '내 지출에 새 댓글이 달렸어요',
      body: '민감한 내용은 알림에 표시하지 않아요. 앱에서 확인해 주세요.',
      route: `/expense/${newRelevantComment.expenseId}`,
    });
  }

  // 방 멤버십 기준으로만 비교한다. 주차 참여자는 매주 자동 전개되므로
  // period_members 를 비교하면 매주 월요일마다 거짓 알림이 울린다.
  const oldMemberships = new Set(before.roomMembers.map((member) => `${member.roomId}:${member.userId}`));
  const joined = after.roomMembers.find(
    (member) => !oldMemberships.has(`${member.roomId}:${member.userId}`) && member.userId !== after.currentUserId,
  );
  if (joined) {
    jobs.push({
      id: `membership:${joined.roomId}:${joined.userId}`,
      title: '새 멤버가 방에 합류했어요',
      body: '멤버 목록에서 새 적용한도를 확인해 보세요.',
      route: '/',
    });
  }
  return jobs;
}
