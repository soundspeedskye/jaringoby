import type { AppNotification } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import { useAppStoreSelector } from '@/shared/providers/app-store-provider';
import { shallowArrayEqual } from '@/shared/providers/store-hooks';

const EMPTY_NOTIFICATIONS: AppNotification[] = [];

const selectNotifications = (state: AppStoreState) =>
  state.snapshot?.notifications ?? EMPTY_NOTIFICATIONS;

const selectUnreadNotificationCount = (state: AppStoreState) => {
  const notifications = state.snapshot?.notifications;
  if (!notifications) return 0;
  let unread = 0;
  for (const notification of notifications) {
    if (!notification.readAt) unread += 1;
  }
  return unread;
};

export function useNotifications(): AppNotification[] {
  return useAppStoreSelector(selectNotifications, shallowArrayEqual);
}

export function useUnreadNotificationCount(): number {
  return useAppStoreSelector(selectUnreadNotificationCount);
}
