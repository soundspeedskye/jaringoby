import type { AppSnapshot } from '@/data/types';
import type { DataMode } from '@/data/repository-factory';
import { buildAppIndexes, type AppIndexes } from '@/store/app-indexes';
import { deriveAppState, type AppDerivedState } from '@/store/app-selectors';

export type AppStoreState = AppDerivedState & {
  dataMode: DataMode;
  snapshot: AppSnapshot | null;
  indexes: AppIndexes;
};

export type AppStore = {
  getState: () => AppStoreState;
  setSnapshot: (snapshot: AppSnapshot) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createAppStore(input: {
  dataMode: DataMode;
}): AppStore {
  const emptyIndexes = buildAppIndexes(null);
  let state: AppStoreState = {
    ...input,
    snapshot: null,
    indexes: emptyIndexes,
    ...deriveAppState(null, emptyIndexes),
  };
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setSnapshot: (incoming) => {
      const previousSnapshot = state.snapshot;
      const snapshot = shareAppSnapshot(previousSnapshot, incoming);
      if (snapshot === previousSnapshot) return;
      const indexes = buildAppIndexes(snapshot, previousSnapshot, state.indexes);
      const derivedState = deriveAppState(snapshot, indexes, previousSnapshot, state);
      state = {
        dataMode: state.dataMode,
        snapshot,
        indexes,
        ...derivedState,
      };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function structurallyShare<T>(previous: T, incoming: T): T {
  if (Object.is(previous, incoming)) return previous;
  if (Array.isArray(previous) && Array.isArray(incoming)) {
    const next = incoming.map((value, index) => structurallyShare(previous[index], value));
    return (
      previous.length === next.length && next.every((value, index) => value === previous[index])
        ? previous
        : next
    ) as T;
  }
  if (isRecord(previous) && isRecord(incoming)) {
    const next = shareRecord(previous, incoming);
    const keys = new Set([...Object.keys(previous), ...Object.keys(incoming)]);
    return [...keys].every((key) => Object.is(next[key], previous[key])) ? previous : next as T;
  }
  return incoming;
}

function shareAppSnapshot(previous: AppSnapshot | null, incoming: AppSnapshot): AppSnapshot {
  if (!previous || previous.currentUserId !== incoming.currentUserId) return incoming;
  const next: AppSnapshot = {
    currentUserId: incoming.currentUserId,
    profiles: shareRecords(previous.profiles, incoming.profiles, (value) => value.id),
    rooms: shareRecords(previous.rooms, incoming.rooms, (value) => value.id),
    roomMembers: shareRecords(
      previous.roomMembers,
      incoming.roomMembers,
      (value) => `${value.roomId}\u0000${value.userId}`,
    ),
    periods: shareRecords(previous.periods, incoming.periods, (value) => value.id),
    periodMembers: shareRecords(
      previous.periodMembers,
      incoming.periodMembers,
      (value) => `${value.periodId}\u0000${value.userId}`,
    ),
    periodResults: shareRecords(
      previous.periodResults,
      incoming.periodResults,
      (value) => `${value.periodId}\u0000${value.userId}`,
    ),
    memberStats: shareRecords(
      previous.memberStats,
      incoming.memberStats,
      (value) => `${value.roomId}\u0000${value.userId}`,
    ),
    expenses: shareRecords(previous.expenses, incoming.expenses, (value) => value.id),
    comments: shareRecords(previous.comments, incoming.comments, (value) => value.id),
    processedRequestIds: structurallyShare(previous.processedRequestIds, incoming.processedRequestIds),
  };
  return Object.keys(next).every(
    (key) => next[key as keyof AppSnapshot] === previous[key as keyof AppSnapshot],
  )
    ? previous
    : next;
}

function shareRecords<T>(previous: T[], incoming: T[], keyOf: (value: T) => string): T[] {
  const previousByKey = new Map(previous.map((value) => [keyOf(value), value]));
  const next = incoming.map((value) => {
    const oldValue = previousByKey.get(keyOf(value));
    return oldValue === undefined ? value : structurallyShare(oldValue, value);
  });
  return previous.length === next.length && next.every((value, index) => value === previous[index])
    ? previous
    : next;
}

function shareRecord(
  previous: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(incoming).map(([key, value]) => [key, structurallyShare(previous[key], value)]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
