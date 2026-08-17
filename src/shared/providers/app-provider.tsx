import type { PropsWithChildren } from "react";
import { useState } from "react";

import { getRepositoryRuntime } from "@/shared/api/repository-factory";
import { AppActionsProvider } from "@/shared/providers/app-actions-provider";
import { AppStatusProvider } from "@/shared/providers/app-status-provider";
import { AppStoreProvider } from "@/shared/providers/app-store-provider";
import { SyncProvider } from "@/shared/providers/sync-provider";
import { createAppStore } from "@/shared/model/app-store";

const runtime = getRepositoryRuntime();

export function AppProvider({
  children,
  sessionUserId,
}: PropsWithChildren<{ sessionUserId: string | null }>) {
  const [store] = useState(() =>
    createAppStore(),
  );

  return (
    <AppStoreProvider store={store}>
      <AppStatusProvider
        repository={runtime.repository}
        sessionUserId={sessionUserId}
      >
        <AppActionsProvider repository={runtime.repository}>
          <SyncProvider offlineQueue={runtime.offlineQueue}>
            {children}
          </SyncProvider>
        </AppActionsProvider>
      </AppStatusProvider>
    </AppStoreProvider>
  );
}
