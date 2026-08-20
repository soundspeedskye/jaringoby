import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import type { AppRepository } from '@/shared/api/repository';
import type { AppSnapshot } from '@/shared/api/types';
import { useAppStore } from '@/shared/providers/app-store-provider';

type AppStatusContextValue = {
  loading: boolean;
  error: string | null;
};

type RefreshOptions = {
  /**
   * 전역 loading을 건드리지 않고 갱신한다.
   * 당겨서 새로고침처럼 화면이 이미 그려진 상태에서 쓴다. loading을 올리면
   * 그 값으로 화면 상태를 가르는 곳(use-room-home 등)이 통째로 스피너로
   * 바뀌어, 정작 당김 인디케이터가 사라진다.
   */
  silent?: boolean;
};

type AppStatusActionsContextValue = {
  refresh: (options?: RefreshOptions) => Promise<void>;
  clearError: () => void;
};

type AppExecutionContextValue = {
  execute: <T>(action: () => Promise<T>) => Promise<T>;
  reportError: (reason: unknown, fallback: string) => void;
};

const AppStatusContext = createContext<AppStatusContextValue | null>(null);
const AppStatusActionsContext = createContext<AppStatusActionsContextValue | null>(null);
const AppExecutionContext = createContext<AppExecutionContextValue | null>(null);

export function AppStatusProvider({
  children,
  repository,
  sessionUserId,
}: PropsWithChildren<{
  repository: AppRepository;
  sessionUserId: string | null;
}>) {
  const store = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const acceptsSnapshot = useCallback(
    (snapshot: AppSnapshot) => Boolean(sessionUserId) && snapshot.currentUserId === sessionUserId,
    [sessionUserId],
  );

  const applySnapshot = useCallback((snapshot: AppSnapshot) => {
    if (!acceptsSnapshot(snapshot)) return false;
    store.setSnapshot(snapshot);
    return true;
  }, [acceptsSnapshot, store]);

  const refresh = useCallback(async ({ silent = false }: RefreshOptions = {}) => {
    if (!silent) setLoading(true);
    try {
      const snapshot = await repository.load();
      applySnapshot(snapshot);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason, '데이터를 불러오지 못했어요.'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applySnapshot, repository]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = repository.subscribe((snapshot) => {
      if (!cancelled && applySnapshot(snapshot)) {
        setError(null);
        setLoading(false);
      }
    });
    repository.load()
      .then((snapshot) => {
        if (!cancelled) applySnapshot(snapshot);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason, '데이터를 불러오지 못했어요.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applySnapshot, repository]);

  const clearError = useCallback(() => setError(null), []);
  const reportError = useCallback((reason: unknown, fallback: string) => {
    setError(errorMessage(reason, fallback));
  }, []);
  const execute = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    setError(null);
    try {
      return await action();
    } catch (reason) {
      reportError(reason, '요청을 처리하지 못했어요.');
      throw reason;
    }
  }, [reportError]);

  const statusValue = useMemo(() => ({ loading, error }), [error, loading]);
  const statusActionsValue = useMemo(() => ({ refresh, clearError }), [clearError, refresh]);
  const executionValue = useMemo(() => ({ execute, reportError }), [execute, reportError]);

  return (
    <AppExecutionContext.Provider value={executionValue}>
      <AppStatusActionsContext.Provider value={statusActionsValue}>
        <AppStatusContext.Provider value={statusValue}>
          {children}
        </AppStatusContext.Provider>
      </AppStatusActionsContext.Provider>
    </AppExecutionContext.Provider>
  );
}

export function useAppStatus(): AppStatusContextValue {
  const context = useContext(AppStatusContext);
  if (!context) throw new Error('useAppStatus must be used inside AppStatusProvider');
  return context;
}

export function useAppStatusActions(): AppStatusActionsContextValue {
  const context = useContext(AppStatusActionsContext);
  if (!context) throw new Error('useAppStatusActions must be used inside AppStatusProvider');
  return context;
}

export function useAppExecution(): AppExecutionContextValue {
  const context = useContext(AppExecutionContext);
  if (!context) throw new Error('useAppExecution must be used inside AppStatusProvider');
  return context;
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}
