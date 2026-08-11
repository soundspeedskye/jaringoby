import { Platform } from 'react-native';

import { OfflineQueueRepository } from '@/data/offline-queue-repository';
import type { AppRepository } from '@/data/repository';
import { getSupabaseClient, hasSupabaseConfiguration } from '@/data/supabase-client';
import { SupabaseRepository } from '@/data/supabase-repository';

export type RepositoryRuntime = {
  repository: AppRepository;
  offlineQueue: OfflineQueueRepository | null;
  setActiveUserId: (userId: string | null) => void;
};

let singleton: RepositoryRuntime | null = null;

export function getRepositoryRuntime(): RepositoryRuntime {
  if (singleton) return singleton;

  if (!hasSupabaseConfiguration()) {
    throw new Error(
      'Supabase 설정이 없습니다. EXPO_PUBLIC_SUPABASE_URL과 ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 설정해 주세요.',
    );
  }

  const base = new SupabaseRepository(getSupabaseClient());
  // Browser-picked photos are temporary blob URLs. Until the web runtime has
  // an IndexedDB-backed binary resolver, enabling the durable queue there
  // would promise persistence that a page reload cannot actually provide.
  const offlineQueue = Platform.OS === 'web' ? null : new OfflineQueueRepository(base);
  singleton = {
    repository: offlineQueue ?? base,
    offlineQueue,
    setActiveUserId: (userId) => offlineQueue?.setActiveUserId(userId),
  };
  return singleton;
}
