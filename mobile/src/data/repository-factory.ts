import { LocalRepository } from '@/data/local-repository';
import type { AppRepository } from '@/data/repository';
import { getSupabaseClient, hasSupabaseConfiguration } from '@/data/supabase-client';
import { SupabaseRepository } from '@/data/supabase-repository';

export type DataMode = 'demo' | 'supabase';

export type RepositoryRuntime = {
  repository: AppRepository;
  dataMode: DataMode;
  isConfigured: boolean;
  isSupabaseConfigured: boolean;
};

let singleton: RepositoryRuntime | null = null;

export function getRepositoryRuntime(): RepositoryRuntime {
  if (singleton) return singleton;

  const configured = hasSupabaseConfiguration();
  const requestedMode = process.env.EXPO_PUBLIC_DATA_MODE?.trim().toLowerCase();
  const useSupabase = requestedMode !== 'demo' && configured;
  singleton = useSupabase
    ? {
        repository: new SupabaseRepository(getSupabaseClient()),
        dataMode: 'supabase',
        isConfigured: true,
        isSupabaseConfigured: true,
      }
    : {
        repository: new LocalRepository(),
        dataMode: 'demo',
        isConfigured: configured,
        isSupabaseConfigured: configured,
      };
  return singleton;
}

export function createAppRepository(): AppRepository {
  return getRepositoryRuntime().repository;
}
