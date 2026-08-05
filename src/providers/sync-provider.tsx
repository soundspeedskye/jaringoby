import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type {
  OfflineMutationSummary,
  OfflineQueueRepository,
} from '@/data/offline-queue-repository';
import { useAppExecution } from '@/providers/app-status-provider';
import { structurallyShare } from '@/store/app-store';

type SyncContextValue = {
  operations: OfflineMutationSummary[];
  retryOperation: (operationId: string) => Promise<void>;
  discardOperation: (operationId: string) => Promise<void>;
  getCopyableError: (operationId: string) => Promise<string | null>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({
  children,
  offlineQueue,
}: PropsWithChildren<{ offlineQueue: OfflineQueueRepository | null }>) {
  const { execute, reportError } = useAppExecution();
  const [operationStore] = useState(() => new SyncOperationStore());
  const operations = useSyncExternalStore(
    operationStore.subscribe,
    operationStore.getSnapshot,
    operationStore.getSnapshot,
  );

  // Tracks the queue revision last read, so data-only syncs (which reuse the
  // revision) skip the getQueueOperations() filter/sort/map entirely.
  const lastRevisionRef = useRef(-1);
  const refreshOperations = useCallback(async () => {
    if (!offlineQueue) return;
    // Capture before the await so a queue change during it still re-refreshes.
    lastRevisionRef.current = offlineQueue.getQueueRevision();
    try {
      operationStore.setOperations(await offlineQueue.getQueueOperations());
    } catch (reason) {
      reportError(reason, '동기화 대기열을 읽지 못했어요.');
    }
  }, [offlineQueue, operationStore, reportError]);

  useEffect(() => {
    if (!offlineQueue) return;
    lastRevisionRef.current = -1;
    const unsubscribe = offlineQueue.subscribe(() => {
      if (offlineQueue.getQueueRevision() === lastRevisionRef.current) return;
      void refreshOperations();
    });
    void refreshOperations();
    return unsubscribe;
  }, [offlineQueue, refreshOperations]);

  const retryOperation = useCallback(
    (operationId: string) => execute(async () => {
      if (!offlineQueue) return;
      await offlineQueue.retryOperation(operationId);
      await refreshOperations();
    }),
    [execute, offlineQueue, refreshOperations],
  );
  const discardOperation = useCallback(
    (operationId: string) => execute(async () => {
      if (!offlineQueue) return;
      await offlineQueue.discardOperation(operationId);
      await refreshOperations();
    }),
    [execute, offlineQueue, refreshOperations],
  );
  const getCopyableError = useCallback(
    (operationId: string) => offlineQueue?.getCopyableError(operationId) ?? Promise.resolve(null),
    [offlineQueue],
  );
  const value = useMemo(() => ({
    operations,
    retryOperation,
    discardOperation,
    getCopyableError,
  }), [discardOperation, getCopyableError, operations, retryOperation]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSyncQueue(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSyncQueue must be used inside SyncProvider');
  return context;
}

class SyncOperationStore {
  private operations: OfflineMutationSummary[] = [];
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): OfflineMutationSummary[] => this.operations;

  setOperations(next: OfflineMutationSummary[]): void {
    const shared = structurallyShare(this.operations, next);
    if (shared === this.operations) return;
    this.operations = shared;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}
