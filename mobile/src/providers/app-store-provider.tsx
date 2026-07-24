import type { PropsWithChildren } from 'react';
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';

import type { AppStore, AppStoreState } from '@/store/app-store';

type Equality<T> = (left: T, right: T) => boolean;

const AppStoreContext = createContext<AppStore | null>(null);

export function AppStoreProvider({
  children,
  store,
}: PropsWithChildren<{ store: AppStore }>) {
  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside AppStoreProvider');
  return store;
}

export function useAppStoreSelector<T>(
  selector: (state: AppStoreState) => T,
  isEqual: Equality<T> = Object.is,
): T {
  const store = useAppStore();
  const selectionStore = useMemo(
    () => new AppSelectionStore(store, selector, isEqual),
    [isEqual, selector, store],
  );
  return useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  );
}

class AppSelectionStore<T> {
  private selection: T;

  constructor(
    private readonly store: AppStore,
    private readonly selector: (state: AppStoreState) => T,
    private readonly isEqual: Equality<T>,
  ) {
    this.selection = selector(store.getState());
  }

  getSnapshot = (): T => this.selection;

  subscribe = (listener: () => void): (() => void) => {
    const checkForUpdates = () => {
      const next = this.selector(this.store.getState());
      if (this.isEqual(this.selection, next)) return;
      this.selection = next;
      listener();
    };
    const unsubscribe = this.store.subscribe(checkForUpdates);
    checkForUpdates();
    return unsubscribe;
  };
}

export function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every(
    (key) => Object.is(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ),
  );
}

export function shallowMapEqual<K, V>(left: ReadonlyMap<K, V>, right: ReadonlyMap<K, V>): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (!right.has(key) || !Object.is(value, right.get(key))) return false;
  }
  return true;
}
