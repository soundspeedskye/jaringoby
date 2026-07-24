import { describe, expect, it, vi } from 'vitest';

import { createDemoSnapshot } from '@/data/demo-seed';
import { SupabaseRepository } from '@/data/supabase-repository';
import type { AppSnapshot } from '@/data/types';

vi.mock('expo-file-system', () => ({ File: class ExpoFile {} }));
vi.mock('@/data/supabase-client', () => ({
  createSupabaseClientForAccessToken: vi.fn(),
}));

type RepositoryHarness = {
  fetchRealtimeSnapshot: (
    tables: ReadonlySet<string>,
    baseSnapshot?: AppSnapshot | null,
  ) => Promise<AppSnapshot>;
  fetchSnapshot: () => Promise<AppSnapshot>;
  lastSnapshot: AppSnapshot | null;
  listeners: Set<(snapshot: AppSnapshot) => void>;
  requestReload: (tables?: ReadonlySet<string>) => Promise<AppSnapshot>;
};

describe('SupabaseRepository refresh coordination', () => {
  it('joins load to an active reload instead of starting a competing fetch', async () => {
    const snapshot = createDemoSnapshot();
    const deferred = createDeferred<AppSnapshot>();
    const repository = createRepository(snapshot.currentUserId);
    const harness = repository as unknown as RepositoryHarness;
    const fetchSnapshot = vi.fn(() => deferred.promise);
    harness.fetchSnapshot = fetchSnapshot;

    const reload = harness.requestReload();
    await Promise.resolve();
    const load = repository.load();

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    deferred.resolve(snapshot);
    await expect(Promise.all([reload, load])).resolves.toEqual([snapshot, snapshot]);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('upgrades an active partial reload when load requests a full refresh', async () => {
    const initial = createDemoSnapshot();
    const partial = clone(initial);
    partial.comments.push({
      id: 'comment-partial',
      clientRequestId: 'request-partial',
      expenseId: partial.expenses[0]?.id ?? 'expense-1',
      userId: partial.currentUserId,
      body: '부분 갱신',
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z',
      syncStatus: 'SYNCED',
    });
    const full = clone(partial);
    full.rooms[0] = {
      ...full.rooms[0]!,
      name: '전체 갱신된 방',
    };

    const partialFetch = createDeferred<AppSnapshot>();
    const repository = createRepository(initial.currentUserId);
    const harness = repository as unknown as RepositoryHarness;
    harness.lastSnapshot = initial;
    const fetchRealtimeSnapshot = vi.fn(() => partialFetch.promise);
    const fetchSnapshot = vi.fn().mockResolvedValue(full);
    harness.fetchRealtimeSnapshot = fetchRealtimeSnapshot;
    harness.fetchSnapshot = fetchSnapshot;
    const listener = vi.fn();
    harness.listeners.add(listener);

    const realtimeReload = harness.requestReload(new Set(['comments']));
    await Promise.resolve();
    const load = repository.load();
    partialFetch.resolve(partial);

    await expect(Promise.all([realtimeReload, load])).resolves.toEqual([full, full]);
    expect(fetchRealtimeSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(full);
    expect(harness.lastSnapshot).toEqual(full);
  });

  it('publishes only the final snapshot when another dirty request arrives mid-fetch', async () => {
    const initial = createDemoSnapshot();
    const intermediate = clone(initial);
    intermediate.comments.push({
      id: 'comment-intermediate',
      clientRequestId: 'request-intermediate',
      expenseId: intermediate.expenses[0]?.id ?? 'expense-1',
      userId: intermediate.currentUserId,
      body: '중간 상태',
      createdAt: '2026-07-23T00:00:00.000Z',
      updatedAt: '2026-07-23T00:00:00.000Z',
      syncStatus: 'SYNCED',
    });
    const final = clone(intermediate);
    const expense = final.expenses[0];
    if (!expense) throw new Error('demo expense missing');
    expense.amount += 1;

    const firstFetch = createDeferred<AppSnapshot>();
    const repository = createRepository(initial.currentUserId);
    const harness = repository as unknown as RepositoryHarness;
    harness.lastSnapshot = initial;
    const fetchRealtimeSnapshot = vi.fn()
      .mockImplementationOnce(() => firstFetch.promise)
      .mockResolvedValueOnce(final);
    harness.fetchRealtimeSnapshot = fetchRealtimeSnapshot;
    const listener = vi.fn();
    harness.listeners.add(listener);

    const commentsReload = harness.requestReload(new Set(['comments']));
    await Promise.resolve();
    const expensesReload = harness.requestReload(new Set(['expenses']));
    firstFetch.resolve(intermediate);

    await Promise.all([commentsReload, expensesReload]);

    expect(fetchRealtimeSnapshot).toHaveBeenCalledTimes(2);
    expect(fetchRealtimeSnapshot.mock.calls[1]?.[1]).toEqual(intermediate);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(final);
    expect(harness.lastSnapshot).toEqual(final);
  });
});

function createRepository(userId: string): SupabaseRepository {
  return new SupabaseRepository(
    {} as never,
    { fixedUserId: userId, observeAuth: false },
  );
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
