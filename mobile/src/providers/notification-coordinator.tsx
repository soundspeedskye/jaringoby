import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { type PropsWithChildren, useEffect, useRef } from 'react';

import type { AppSnapshot } from '@/data/types';
import { useAppData } from '@/providers/app-provider';
import {
  loadNotificationPreferences,
  presentPrivacySafeNotification,
  syncChallengeNotificationSchedule,
} from '@/services/notification-service';

export function NotificationCoordinator({ children }: PropsWithChildren) {
  const router = useRouter();
  const { snapshot } = useAppData();
  const previous = useRef<AppSnapshot | null>(null);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = response.notification.request.content.data?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.push(route as never);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const route = response?.notification.request.content.data?.route;
      if (typeof route === 'string' && route.startsWith('/')) router.replace(route as never);
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!snapshot) return;
    let cancelled = false;
    void loadNotificationPreferences().then(async (preferences) => {
      if (cancelled) return;
      if (preferences.challengeEvents) await syncChallengeNotificationSchedule(snapshot.challenges);
      const before = previous.current;
      if (before && preferences.socialEvents) await announceSocialChanges(before, snapshot);
      previous.current = snapshot;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [snapshot]);

  return children;
}

async function announceSocialChanges(before: AppSnapshot, after: AppSnapshot): Promise<void> {
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
    await presentPrivacySafeNotification({
      title: newRelevantComment.replyToId ? '새 답글이 도착했어요' : '내 지출에 새 댓글이 달렸어요',
      body: '민감한 내용은 알림에 표시하지 않아요. 앱에서 확인해 주세요.',
      route: `/expense/${newRelevantComment.expenseId}`,
    });
  }

  const oldMemberships = new Set(before.members.map((member) => `${member.challengeId}:${member.userId}`));
  const joined = after.members.find(
    (member) => !oldMemberships.has(`${member.challengeId}:${member.userId}`) && member.userId !== after.currentUserId,
  );
  if (joined) {
    await presentPrivacySafeNotification({
      title: '새 멤버가 챌린지에 합류했어요',
      body: '멤버 목록에서 새 적용한도를 확인해 보세요.',
      route: '/',
    });
  }
}
