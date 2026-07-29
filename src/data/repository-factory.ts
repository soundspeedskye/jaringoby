import { Platform } from 'react-native';

import { LocalRepository } from '@/data/local-repository';
import { OfflineQueueRepository } from '@/data/offline-queue-repository';
import type { AppRepository } from '@/data/repository';
import { getSupabaseClient, hasSupabaseConfiguration } from '@/data/supabase-client';
import { SupabaseRepository } from '@/data/supabase-repository';

export type DataMode = 'demo' | 'supabase';

export type RepositoryRuntime = {
  repository: AppRepository;
  dataMode: DataMode;
  isConfigured: boolean;
  isSupabaseConfigured: boolean;
  offlineQueue: OfflineQueueRepository | null;
  setActiveUserId: (userId: string | null) => void;
};

let singleton: RepositoryRuntime | null = null;

export function getRepositoryRuntime(): RepositoryRuntime {
  if (singleton) return singleton;

  const configured = hasSupabaseConfiguration();
  const requestedMode = process.env.EXPO_PUBLIC_DATA_MODE?.trim().toLowerCase();

  // Demo is an explicit opt-in dev tool only (EXPO_PUBLIC_DATA_MODE=demo).
  // Real mode NEVER silently falls back to demo: a missing Supabase config must
  // fail loudly instead of shipping seed data as if it were real.
  if (requestedMode === 'demo') {
    singleton = {
      repository: new LocalRepository(),
      dataMode: 'demo',
      isConfigured: configured,
      isSupabaseConfigured: configured,
      offlineQueue: null,
      setActiveUserId: () => undefined,
    };
    return singleton;
  }

  if (!configured) {
    throw new Error(
      'Supabase 설정이 없습니다. 실 데이터로 실행하려면 EXPO_PUBLIC_SUPABASE_URL과 ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 설정하고, 데모로 실행하려면 ' +
        'EXPO_PUBLIC_DATA_MODE=demo를 지정하세요.',
    );
  }

  const base = new SupabaseRepository(getSupabaseClient());
  // Browser-picked photos are temporary blob URLs. Until the web runtime has
  // an IndexedDB-backed binary resolver, enabling the durable queue there
  // would promise persistence that a page reload cannot actually provide.
  const offlineQueue = Platform.OS === 'web' ? null : new OfflineQueueRepository(base);
  singleton = {
    repository: offlineQueue ?? base,
    dataMode: 'supabase',
    isConfigured: true,
    isSupabaseConfigured: true,
    offlineQueue,
    setActiveUserId: (userId) => offlineQueue?.setActiveUserId(userId),
  };
  return singleton;
}
