import type { Profile } from '@/shared/api/types';
import type { AppIndexes } from '@/shared/model/app-indexes';
import type { AppStoreState } from '@/shared/model/app-store';
import { useAppStoreSelector } from '@/shared/providers/app-store-provider';
import { useIndexedMap } from '@/shared/providers/store-hooks';

const selectCurrentUser = (state: AppStoreState) => state.currentUser;

const pickProfileById = (indexes: AppIndexes) => indexes.profileById;

export function useCurrentUser(): Profile | null {
  return useAppStoreSelector(selectCurrentUser);
}

export function useProfiles(userIds: readonly string[]): ReadonlyMap<string, Profile> {
  return useIndexedMap(pickProfileById, userIds);
}
