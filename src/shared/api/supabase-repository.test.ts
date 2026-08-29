import { describe, expect, it, vi } from 'vitest';

import { SupabaseRepository } from '@/shared/api/supabase-repository';
import type { AppSnapshot } from '@/shared/api/types';
import { createTestSnapshot } from '@/test/app-snapshot-fixture';

vi.mock('expo-file-system', () => ({ File: class ExpoFile {} }));
vi.mock('@/shared/api/supabase-client', () => ({
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

type RealtimeHarness = RepositoryHarness & {
  scheduleRealtimeReload: (table?: string, mentionCommentId?: string) => void;
};

describe('SupabaseRepository refresh coordination', () => {
  it('joins load to an active reload instead of starting a competing fetch', async () => {
    const snapshot = createTestSnapshot();
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
    const initial = createTestSnapshot();
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
    const initial = createTestSnapshot();
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
    if (!expense) throw new Error('test expense missing');
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

describe('SupabaseRepository realtime scheduling', () => {
  it('patches instead of refetching everything for a single dirty table', async () => {
    vi.useFakeTimers();
    try {
      const initial = createTestSnapshot();
      const repository = createRepository(initial.currentUserId);
      const harness = repository as unknown as RealtimeHarness;
      harness.lastSnapshot = initial;
      const fetchRealtimeSnapshot = vi.fn().mockResolvedValue(initial);
      const fetchSnapshot = vi.fn().mockResolvedValue(initial);
      harness.fetchRealtimeSnapshot = fetchRealtimeSnapshot;
      harness.fetchSnapshot = fetchSnapshot;

      harness.scheduleRealtimeReload('expenses');
      await vi.advanceTimersByTimeAsync(200);

      expect(fetchSnapshot).not.toHaveBeenCalled();
      expect(fetchRealtimeSnapshot).toHaveBeenCalledTimes(1);
      expect(fetchRealtimeSnapshot.mock.calls[0]?.[0]).toEqual(new Set(['expenses']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('still refetches everything when asked without a table', async () => {
    vi.useFakeTimers();
    try {
      const initial = createTestSnapshot();
      const repository = createRepository(initial.currentUserId);
      const harness = repository as unknown as RealtimeHarness;
      harness.lastSnapshot = initial;
      const fetchRealtimeSnapshot = vi.fn().mockResolvedValue(initial);
      const fetchSnapshot = vi.fn().mockResolvedValue(initial);
      harness.fetchRealtimeSnapshot = fetchRealtimeSnapshot;
      harness.fetchSnapshot = fetchSnapshot;

      harness.scheduleRealtimeReload();
      await vi.advanceTimersByTimeAsync(200);

      expect(fetchSnapshot).toHaveBeenCalledTimes(1);
      expect(fetchRealtimeSnapshot).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-reads every mention when a mention event carries no comment id', async () => {
    vi.useFakeTimers();
    try {
      const initial = createTestSnapshot();
      const repository = createRepository(initial.currentUserId);
      const harness = repository as unknown as RealtimeHarness;
      harness.lastSnapshot = initial;
      const fetchRealtimeSnapshot = vi.fn().mockResolvedValue(initial);
      harness.fetchRealtimeSnapshot = fetchRealtimeSnapshot;
      harness.fetchSnapshot = vi.fn().mockResolvedValue(initial);

      harness.scheduleRealtimeReload('comment_mentions', 'comment-1');
      harness.scheduleRealtimeReload('comment_mentions');
      await vi.advanceTimersByTimeAsync(200);

      expect(fetchRealtimeSnapshot).toHaveBeenCalledTimes(1);
      // 범위를 좁힐 수 없으면 undefined로 넘겨 멘션 전체를 다시 읽는다.
      expect(fetchRealtimeSnapshot.mock.calls[0]?.[2]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps read tables on the patch path', async () => {
    vi.useFakeTimers();
    try {
      const initial = createTestSnapshot();
      const repository = createRepository(initial.currentUserId);
      const harness = repository as unknown as RealtimeHarness;
      harness.lastSnapshot = initial;
      const fetchRealtimeSnapshot = vi.fn().mockResolvedValue(initial);
      const fetchSnapshot = vi.fn().mockResolvedValue(initial);
      harness.fetchRealtimeSnapshot = fetchRealtimeSnapshot;
      harness.fetchSnapshot = fetchSnapshot;

      harness.scheduleRealtimeReload('expense_reads');
      await vi.advanceTimersByTimeAsync(200);
      harness.scheduleRealtimeReload('room_post_reads');
      await vi.advanceTimersByTimeAsync(200);

      expect(fetchSnapshot).not.toHaveBeenCalled();
      expect(fetchRealtimeSnapshot).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
