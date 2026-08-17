import { useCallback } from 'react';
import type { Profile } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import {
  shallowMapEqual,
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';
import { useStableIds } from '@/shared/providers/store-hooks';

const selectCurrentUser = (state: AppStoreState) => state.currentUser;

export function useCurrentUser(): Profile | null {
  return useAppStoreSelector(selectCurrentUser);
}

/** 최신 100건의 사용자별 소식. 서버가 읽음 상태의 권위다. */

export function useProfiles(userIds: readonly string[]): ReadonlyMap<string, Profile> {
  const normalizedIds = useStableIds(userIds);
  const selector = useCallback((state: AppStoreState) => {
    const profiles = new Map<string, Profile>();
    normalizedIds.forEach((userId) => {
      const profile = state.indexes.profileById.get(userId);
      if (profile) profiles.set(userId, profile);
    });
    return profiles;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowMapEqual);
}
