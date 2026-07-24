import type { PropsWithChildren } from 'react';
import { useState } from 'react';

import { getRepositoryRuntime } from '@/data/repository-factory';
import { AppActionsProvider } from '@/providers/app-actions-provider';
import { AppStatusProvider } from '@/providers/app-status-provider';
import { AppStoreProvider } from '@/providers/app-store-provider';
import { SyncProvider } from '@/providers/sync-provider';
import { createAppStore } from '@/store/app-store';

const runtime = getRepositoryRuntime();

export function AppProvider({
  children,
  sessionUserId,
}: PropsWithChildren<{ sessionUserId: string | null }>) {
  const [store] = useState(() => createAppStore({
    dataMode: runtime.dataMode,
  }));

  return (
    <AppStoreProvider store={store}>
      <AppStatusProvider
        dataMode={runtime.dataMode}
        repository={runtime.repository}
        sessionUserId={sessionUserId}>
        <AppActionsProvider repository={runtime.repository}>
          <SyncProvider offlineQueue={runtime.offlineQueue}>
            {children}
          </SyncProvider>
        </AppActionsProvider>
      </AppStatusProvider>
    </AppStoreProvider>
  );
}
