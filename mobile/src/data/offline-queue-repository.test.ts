import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OfflineQueueRepository,
  type DurablePhotoStore,
  type OfflineNetworkMonitor,
  type OfflineQueueStorage,
  type PersistedPhoto,
} from '@/data/offline-queue-repository';
import {
  expenseOfficialAmount,
  expenseOptimisticAmount,
  expensePendingDelta,
} from '@/data/expense-sync';
import type { AppRepository, Unsubscribe, UpdateExpenseOptions } from '@/data/repository';
import type {
  AddCommentInput,
  AddExpenseInput,
  AppSnapshot,
  Comment,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Period,
  Room,
  RoomMember,
} from '@/data/types';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    removeItem: vi.fn(async () => undefined),
    setItem: vi.fn(async () => undefined),
  },
}));

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => () => undefined),
    fetch: vi.fn(async () => ({ isConnected: false, isInternetReachable: false })),
  },
}));

// 2099-01-05 is a Monday: the fixture period runs Mon 01-05 … Fri 01-09.
const FUTURE_PERIOD = periodFixture('2099-01-05');

describe('OfflineQueueRepository', () => {
  let ids: number;

  beforeEach(() => {
    ids = 0;
  });

  it('restores a durable optimistic expense after restart and replays it once', async () => {
    const storage = new MemoryStorage();
    const photos = new MemoryPhotoStore();
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const firstNetwork = new FakeNetwork(false);
    const first = repository(base, storage, firstNetwork, photos);

    await first.load();
    const optimistic = await first.addExpense(expenseInput('request-1'));
    expect(optimistic.syncStatus).toBe('PENDING');
    expect(await first.getQueueOperations()).toHaveLength(1);
    first.dispose();

    base.loadError = new Error('NETWORK_ERROR: 오프라인입니다.');
    const secondNetwork = new FakeNetwork(false);
    const second = repository(base, storage, secondNetwork, photos);
    const restored = await second.load();
    expect(restored.expenses).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientRequestId: 'request-1', syncStatus: 'PENDING' }),
    ]));

    base.loadError = null;
    secondNetwork.online = true;
    await second.flushNow();
    expect(base.addExpenseCalls).toBe(1);
    expect(await second.getQueueOperations()).toHaveLength(0);
    expect((await second.load()).expenses).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientRequestId: 'request-1', syncStatus: 'SYNCED' }),
    ]));
  });

  it('never exposes a cached account snapshot when authentication is invalid', async () => {
    const storage = new MemoryStorage();
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const first = repository(base, storage, new FakeNetwork(false), new MemoryPhotoStore());

    await first.load();
    first.dispose();
    base.loadError = new Error('AUTH_REQUIRED: 로그인이 필요해요.');

    const second = repository(base, storage, new FakeNetwork(false), new MemoryPhotoStore());
    await expect(second.load()).rejects.toThrow('AUTH_REQUIRED');
  });

  it('does not load or replay until the authenticated user is explicitly known', async () => {
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const queue = new OfflineQueueRepository(base, {
      storage: new MemoryStorage(),
      network: new FakeNetwork(true),
      photoStore: new MemoryPhotoStore(),
    });

    await queue.flushNow();
    expect(base.loadCalls).toBe(0);
    expect(base.addExpenseCalls).toBe(0);
  });

  it('keeps the mutation queue readable when the optional snapshot cache read fails', async () => {
    const storage = new MemoryStorage();
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const first = repository(base, storage, new FakeNetwork(false), new MemoryPhotoStore());
    await first.load();
    await first.addExpense(expenseInput('cache-read-failure'));
    first.dispose();

    storage.failOnReadKey = 'jaringoby.offline-snapshots.v1';
    const second = repository(base, storage, new FakeNetwork(false), new MemoryPhotoStore());
    expect(await second.getQueueOperations()).toHaveLength(1);
  });

  it('never replays an old account queue when the session is signed out or switched', async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork(false);
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const queue = repository(base, storage, network, new MemoryPhotoStore());

    await queue.load();
    await queue.addExpense(expenseInput('request-a'));
    queue.setActiveUserId(null);
    base.loadError = new Error('AUTH_REQUIRED: 로그인이 필요해요.');
    network.online = true;
    await queue.flushNow();
    expect(base.addExpenseCalls).toBe(0);
    expect(await queue.getQueueOperations()).toEqual([]);

    base.loadError = null;
    base.replaceSnapshot(snapshotFixture('user-b', FUTURE_PERIOD));
    queue.setActiveUserId('user-b');
    await queue.load();
    await queue.flushNow();
    expect(base.addExpenseCalls).toBe(0);
    expect(await queue.getQueueOperations()).toEqual([]);

    base.replaceSnapshot(snapshotFixture('user-a', FUTURE_PERIOD));
    queue.setActiveUserId('user-a');
    network.online = false;
    await queue.load();
    expect(await queue.getQueueOperations()).toHaveLength(1);
  });

  it('rebases a version conflict before explicitly reapplying the local patch', async () => {
    const initial = snapshotFixture('user-a', FUTURE_PERIOD);
    initial.expenses.push(expenseFixture({ id: 'expense-1', memo: 'server-v1', version: 1 }));
    const base = new FakeRepository(initial);
    const network = new FakeNetwork(false);
    const queue = repository(base, new MemoryStorage(), network, new MemoryPhotoStore());

    await queue.load();
    await queue.updateExpense('expense-1', { memo: 'my-change' });
    base.replaceExpense(expenseFixture({ id: 'expense-1', memo: 'server-v2', version: 2 }));
    await queue.load();
    const [conflict] = await queue.getQueueOperations();
    expect(conflict).toMatchObject({ status: 'FAILED', failure: { code: 'VERSION_CONFLICT' } });

    network.online = true;
    await queue.retryOperation(conflict.operationId);
    expect(base.updateExpenseCalls).toBe(1);
    expect(base.currentExpense('expense-1')).toMatchObject({ memo: 'my-change', version: 3 });
    expect(await queue.getQueueOperations()).toEqual([]);
  });

  it('keeps server amounts official while projecting pending update and delete changes', async () => {
    const initial = snapshotFixture('user-a', FUTURE_PERIOD);
    initial.expenses.push(expenseFixture({ id: 'expense-aggregate', amount: 10_000, version: 1 }));
    const base = new FakeRepository(initial);
    const queue = repository(base, new MemoryStorage(), new FakeNetwork(false), new MemoryPhotoStore());

    await queue.load();
    await queue.updateExpense('expense-aggregate', { amount: 12_000, category: '커피' });
    let projected = (await queue.load()).expenses.find((expense) => expense.id === 'expense-aggregate');
    expect(projected).toMatchObject({
      amount: 12_000,
      serverAmount: 10_000,
      serverCategory: '점심',
      syncOperation: 'UPDATE',
      syncStatus: 'PENDING',
    });
    expect(expenseOfficialAmount(projected!)).toBe(10_000);
    expect(expenseOptimisticAmount(projected!)).toBe(12_000);
    expect(expensePendingDelta(projected!)).toBe(2_000);

    await queue.deleteExpense('expense-aggregate');
    projected = (await queue.load()).expenses.find((expense) => expense.id === 'expense-aggregate');
    expect(projected).toMatchObject({
      serverAmount: 10_000,
      syncOperation: 'DELETE',
      syncStatus: 'PENDING',
    });
    expect(expenseOfficialAmount(projected!)).toBe(10_000);
    expect(expenseOptimisticAmount(projected!)).toBe(0);
    expect(expensePendingDelta(projected!)).toBe(-10_000);
  });

  it('finalizes an unreceived expense at the adjustment cutoff even while offline', async () => {
    const cutoffPeriod = periodFixture('2026-01-05');
    let now = Date.parse('2026-01-10T02:00:00.000Z');
    const base = new FakeRepository(snapshotFixture('user-a', cutoffPeriod));
    const queue = repository(
      base,
      new MemoryStorage(),
      new FakeNetwork(false),
      new MemoryPhotoStore(),
      () => now,
    );

    await queue.load();
    await queue.addExpense(expenseInput('cutoff-request', cutoffPeriod.id));
    now = Date.parse('2026-01-10T04:00:00.000Z');
    await queue.flushNow();

    const [expired] = await queue.getQueueOperations();
    expect(expired).toMatchObject({ status: 'FAILED', failure: { code: 'CUTOFF_EXPIRED' } });
    expect(base.addExpenseCalls).toBe(0);
    await expect(queue.retryOperation(expired.operationId)).rejects.toThrow('CUTOFF_EXPIRED');
    expect(await queue.getCopyableError(expired.operationId)).toContain('최종 결과에서 제외');
  });

  it('converts an already-failed expense to a permanent cutoff failure', async () => {
    const cutoffPeriod = periodFixture('2026-01-05');
    let now = Date.parse('2026-01-10T02:00:00.000Z');
    const initial = snapshotFixture('user-a', cutoffPeriod);
    initial.expenses.push(expenseFixture({
      id: 'expense-cutoff-conflict',
      periodId: cutoffPeriod.id,
      version: 1,
    }));
    const base = new FakeRepository(initial);
    const queue = repository(
      base,
      new MemoryStorage(),
      new FakeNetwork(false),
      new MemoryPhotoStore(),
      () => now,
    );

    await queue.load();
    await queue.updateExpense('expense-cutoff-conflict', { memo: '내 변경' });
    base.replaceExpense(expenseFixture({
      id: 'expense-cutoff-conflict',
      periodId: cutoffPeriod.id,
      memo: '서버 변경',
      version: 2,
    }));
    await queue.load();
    expect((await queue.getQueueOperations())[0]).toMatchObject({
      status: 'FAILED',
      failure: { code: 'VERSION_CONFLICT' },
    });

    now = Date.parse('2026-01-10T04:00:00.000Z');
    await queue.flushNow();
    const [expired] = await queue.getQueueOperations();
    expect(expired).toMatchObject({
      status: 'FAILED',
      failure: { code: 'CUTOFF_EXPIRED', permanent: true },
    });
    await expect(queue.retryOperation(expired.operationId)).rejects.toThrow('CUTOFF_EXPIRED');
  });

  it('pins an in-flight replay to the account that owns the operation', async () => {
    const storage = new MemoryStorage();
    const network = new FakeNetwork(false);
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const queue = repository(base, storage, network, new MemoryPhotoStore());

    await queue.load();
    await queue.addExpense(expenseInput('account-pinned'));
    base.onRunAsUserStarted = () => queue.setActiveUserId('user-b');
    network.online = true;
    await queue.flushNow();

    expect(base.runAsUserIds).toEqual(['user-a']);
    expect(base.addExpenseCalls).toBe(1);
    expect(await queue.getQueueOperations()).toEqual([]);

    base.onRunAsUserStarted = null;
    queue.setActiveUserId('user-a');
    network.online = false;
    await queue.load();
    expect(await queue.getQueueOperations()).toEqual([]);
  });

  it('finishes old-photo cleanup when an update response was lost', async () => {
    const initial = snapshotFixture('user-a', FUTURE_PERIOD);
    initial.expenses.push(expenseFixture({
      id: 'expense-photo-update',
      photoPath: 'user-a/old-photo.jpg',
      version: 1,
    }));
    const base = new FakeRepository(initial);
    const network = new FakeNetwork(false);
    const queue = repository(base, new MemoryStorage(), network, new MemoryPhotoStore());

    await queue.load();
    await queue.updateExpense('expense-photo-update', { photoUri: 'file:///picker/new-photo.jpg' });
    base.replaceExpense(expenseFixture({
      id: 'expense-photo-update',
      photoPath: `${FUTURE_PERIOD.id}/user-a/expense-update-generated-1-photo-1`,
      version: 2,
    }));
    const reconciled = await queue.load();
    expect(reconciled.expenses.find((expense) => expense.id === 'expense-photo-update')).toMatchObject({
      photoPath: `${FUTURE_PERIOD.id}/user-a/expense-update-generated-1-photo-1`,
      syncStatus: 'SYNCED',
    });
    await expect(queue.updateExpense('expense-photo-update', { memo: '다음 변경' }))
      .rejects.toThrow('PHOTO_CLEANUP_PENDING');

    network.online = true;
    await queue.flushNow();
    expect(base.updateExpenseCalls).toBe(0);
    expect(base.cleanedPhotoPaths).toEqual(['user-a/old-photo.jpg']);
    expect(await queue.getQueueOperations()).toEqual([]);
  });

  it('passes a deterministic photo path to a live update replay', async () => {
    const initial = snapshotFixture('user-a', FUTURE_PERIOD);
    initial.expenses.push(expenseFixture({ id: 'expense-photo-live', photoPath: 'user-a/old.jpg', version: 1 }));
    const base = new FakeRepository(initial);
    const network = new FakeNetwork(false);
    const queue = repository(base, new MemoryStorage(), network, new MemoryPhotoStore());

    await queue.load();
    await queue.updateExpense('expense-photo-live', { photoUri: 'file:///picker/new.jpg' });
    network.online = true;
    await queue.flushNow();

    expect(base.expectedPhotoPaths).toEqual([
      `${FUTURE_PERIOD.id}/user-a/expense-update-generated-1-photo-1`,
    ]);
  });

  it('finishes photo cleanup when a delete response was lost', async () => {
    const initial = snapshotFixture('user-a', FUTURE_PERIOD);
    initial.expenses.push(expenseFixture({
      id: 'expense-photo-delete',
      photoPath: 'user-a/deleted-photo.jpg',
      version: 1,
    }));
    const base = new FakeRepository(initial);
    const network = new FakeNetwork(false);
    const queue = repository(base, new MemoryStorage(), network, new MemoryPhotoStore());

    await queue.load();
    await queue.deleteExpense('expense-photo-delete');
    base.replaceExpense(expenseFixture({
      id: 'expense-photo-delete',
      photoPath: 'user-a/deleted-photo.jpg',
      deletedAt: '2099-01-03T00:00:00.000Z',
      version: 2,
    }));
    await queue.load();

    network.online = true;
    await queue.flushNow();
    expect(base.cleanedPhotoPaths).toEqual(['user-a/deleted-photo.jpg']);
    expect(await queue.getQueueOperations()).toEqual([]);
  });

  it('rolls memory and cached photos back when the durable envelope write fails', async () => {
    const storage = new MemoryStorage();
    const photos = new MemoryPhotoStore();
    const queue = repository(
      new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD)),
      storage,
      new FakeNetwork(false),
      photos,
    );

    await queue.load();
    storage.failOnWrite = storage.writeCount + 1;
    await expect(queue.addExpense(expenseInput('write-failure'))).rejects.toThrow('storage failed');
    expect(await queue.getQueueOperations()).toEqual([]);
    expect(photos.uris.size).toBe(0);
  });

  it('keeps a committed-but-unacknowledged mutation durable and reconciles without duplication', async () => {
    const storage = new MemoryStorage();
    const photos = new MemoryPhotoStore();
    const network = new FakeNetwork(false);
    const base = new FakeRepository(snapshotFixture('user-a', FUTURE_PERIOD));
    const queue = repository(base, storage, network, photos);

    await queue.load();
    await queue.addExpense(expenseInput('response-lost'));
    await queue.flushNow();
    network.online = true;
    storage.failOnWrite = storage.writeCount + 3;
    await queue.flushNow();
    expect(base.addExpenseCalls).toBe(1);
    expect(await queue.getQueueOperations()).toHaveLength(1);
    expect(photos.uris.size).toBe(1);

    storage.failOnWrite = null;
    await queue.flushNow();
    expect(base.addExpenseCalls).toBe(1);
    expect(await queue.getQueueOperations()).toEqual([]);
    expect(photos.uris.size).toBe(0);
  });

  function repository(
    base: FakeRepository,
    storage: MemoryStorage,
    network: FakeNetwork,
    photos: MemoryPhotoStore,
    now: () => number = Date.now,
  ): OfflineQueueRepository {
    const queue = new OfflineQueueRepository(base, {
      storage,
      network,
      photoStore: photos,
      now,
      randomId: () => `generated-${++ids}`,
      baseBackoffMs: 100,
      maxBackoffMs: 100,
    });
    queue.setActiveUserId(base.userId);
    return queue;
  }
});

class MemoryStorage implements OfflineQueueStorage {
  readonly values = new Map<string, string>();
  writeCount = 0;
  failOnWrite: number | null = null;
  failOnReadKey: string | null = null;

  async getItem(key: string): Promise<string | null> {
    if (key === this.failOnReadKey) throw new Error('storage read failed');
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writeCount += 1;
    if (this.writeCount === this.failOnWrite) throw new Error('storage failed');
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

class FakeNetwork implements OfflineNetworkMonitor {
  private readonly listeners = new Set<(online: boolean) => void>();

  constructor(public online: boolean) {}

  async fetch(): Promise<boolean> {
    return this.online;
  }

  subscribe(listener: (online: boolean) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOnline(online: boolean): void {
    this.online = online;
    this.listeners.forEach((listener) => listener(online));
  }
}

class MemoryPhotoStore implements DurablePhotoStore {
  readonly uris = new Set<string>();

  async persist(_sourceUri: string, operationId: string): Promise<PersistedPhoto> {
    const uri = `file:///durable/${encodeURIComponent(operationId)}.jpg`;
    this.uris.add(uri);
    return { uri, owned: true };
  }

  async remove(uri: string): Promise<void> {
    this.uris.delete(uri);
  }
}

class FakeRepository implements AppRepository {
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<(snapshot: AppSnapshot) => void>();
  loadError: Error | null = null;
  loadCalls = 0;
  addExpenseCalls = 0;
  updateExpenseCalls = 0;
  readonly cleanedPhotoPaths: string[] = [];
  readonly expectedPhotoPaths: (string | undefined)[] = [];
  readonly runAsUserIds: string[] = [];
  onRunAsUserStarted: (() => void) | null = null;

  constructor(snapshot: AppSnapshot) {
    this.snapshot = clone(snapshot);
  }

  get userId(): string {
    return this.snapshot.currentUserId;
  }

  replaceSnapshot(snapshot: AppSnapshot): void {
    this.snapshot = clone(snapshot);
  }

  replaceExpense(expense: Expense): void {
    this.snapshot.expenses = this.snapshot.expenses.filter((item) => item.id !== expense.id);
    this.snapshot.expenses.push(clone(expense));
  }

  currentExpense(id: string): Expense | undefined {
    return clone(this.snapshot.expenses.find((expense) => expense.id === id));
  }

  async load(): Promise<AppSnapshot> {
    this.loadCalls += 1;
    if (this.loadError) throw this.loadError;
    return clone(this.snapshot);
  }

  async runAsUser<T>(
    userId: string,
    work: (repository: AppRepository) => Promise<T>,
  ): Promise<T> {
    if (userId !== this.userId) throw new Error('SESSION_CHANGED');
    this.runAsUserIds.push(userId);
    this.onRunAsUserStarted?.();
    return work(this);
  }

  async cleanupExpensePhoto(path: string): Promise<void> {
    this.cleanedPhotoPaths.push(path);
  }

  async resetDemo(): Promise<AppSnapshot> {
    return this.load();
  }

  async createRoom(_input: CreateRoomInput): Promise<Room> {
    throw new Error('not implemented');
  }

  async increaseCapacity(_roomId: string, _capacity: number): Promise<Room> {
    throw new Error('not implemented');
  }

  async previewInvite(_inviteCode: string): Promise<InvitePreview> {
    throw new Error('not implemented');
  }

  async joinRoom(_inviteCode: string, _joinedAt?: string): Promise<RoomMember> {
    throw new Error('not implemented');
  }

  async leaveRoom(_roomId: string, _successorUserId?: string): Promise<void> {
    throw new Error('not implemented');
  }

  async closeRoom(_roomId: string): Promise<Room> {
    throw new Error('not implemented');
  }

  async addExpense(input: AddExpenseInput): Promise<Expense> {
    const existing = this.snapshot.expenses.find(
      (expense) => expense.clientRequestId === input.clientRequestId,
    );
    if (existing) return clone(existing);
    this.addExpenseCalls += 1;
    const expense = expenseFixture({
      id: `server-${input.clientRequestId}`,
      clientRequestId: input.clientRequestId,
      periodId: input.periodId,
      amount: input.amount,
      category: input.category,
      memo: input.memo,
      photoUri: input.photoUri,
      occurredAt: input.occurredAt,
      version: 1,
    });
    this.snapshot.expenses.push(expense);
    this.snapshot.processedRequestIds.push(input.clientRequestId);
    return clone(expense);
  }

  async updateExpense(
    expenseId: string,
    patch: Partial<AddExpenseInput>,
    options?: UpdateExpenseOptions,
  ): Promise<Expense> {
    this.updateExpenseCalls += 1;
    this.expectedPhotoPaths.push(options?.expectedPhotoPath);
    const current = this.snapshot.expenses.find((expense) => expense.id === expenseId);
    if (!current) throw new Error('NOT_FOUND');
    Object.assign(current, patch, {
      updatedAt: new Date(Date.parse(current.updatedAt) + 1_000).toISOString(),
      version: (current.version ?? 0) + 1,
    });
    return clone(current);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const current = this.snapshot.expenses.find((expense) => expense.id === expenseId);
    if (current) current.deletedAt = '2099-01-03T00:00:00.000Z';
  }

  async addComment(input: AddCommentInput): Promise<Comment> {
    const comment = commentFixture({
      id: `server-${input.clientRequestId}`,
      clientRequestId: input.clientRequestId,
      expenseId: input.expenseId,
      body: input.body,
      replyToId: input.replyToId,
    });
    this.snapshot.comments.push(comment);
    return clone(comment);
  }

  async updateComment(commentId: string, body: string): Promise<Comment> {
    const current = this.snapshot.comments.find((comment) => comment.id === commentId);
    if (!current) throw new Error('NOT_FOUND');
    current.body = body;
    current.version = (current.version ?? 0) + 1;
    return clone(current);
  }

  async deleteComment(commentId: string): Promise<void> {
    const current = this.snapshot.comments.find((comment) => comment.id === commentId);
    if (current) current.deletedAt = '2099-01-03T00:00:00.000Z';
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function snapshotFixture(userId: string, period: Period): AppSnapshot {
  return {
    currentUserId: userId,
    profiles: [{ id: userId, nickname: userId, avatar: '🙂' }],
    rooms: [{
      id: period.roomId,
      ownerId: 'user-a',
      name: '테스트 방',
      inviteCode: 'ABC234',
      baseAmount: 50_000,
      capacity: 4,
      status: 'OPEN',
      createdAt: `${period.weekStart}T00:00:00.000Z`,
    }],
    roomMembers: [{
      roomId: period.roomId,
      userId,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: `${period.weekStart}T00:00:00.000Z`,
    }],
    periods: [clone(period)],
    periodMembers: [{
      periodId: period.id,
      userId,
      joinedAt: `${period.weekStart}T00:00:00.000Z`,
      joinedDate: period.weekStart,
      eligibleDayCount: 5,
      appliedLimit: 50_000,
      status: 'ACTIVE',
      isLateJoiner: false,
    }],
    periodResults: [],
    memberStats: [],
    expenses: [],
    comments: [],
    processedRequestIds: [],
  };
}

function periodFixture(weekStart: string): Period {
  const weekEnd = `${weekStart.slice(0, 8)}${String(Number(weekStart.slice(8)) + 4).padStart(2, '0')}`;
  return {
    id: `period-${weekStart}`,
    roomId: `room-${weekStart}`,
    weekIndex: 1,
    weekStart: weekStart as Period['weekStart'],
    weekEnd: weekEnd as Period['weekEnd'],
    selectedDayCount: 5,
    validDayCount: 5,
    holidayDates: [],
    holidayVersionId: 'test',
    phase: 'ACTIVE',
    isRestWeek: false,
    createdAt: `${weekStart}T00:00:00.000Z`,
  };
}

function expenseInput(requestId: string, periodId = FUTURE_PERIOD.id): AddExpenseInput {
  return {
    periodId,
    amount: 10_000,
    category: '점심',
    memo: '테스트',
    photoUri: 'file:///picker/photo.jpg',
    occurredAt: '2099-01-06T03:00:00.000Z',
    clientRequestId: requestId,
  };
}

function expenseFixture(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-default',
    clientRequestId: 'request-default',
    periodId: FUTURE_PERIOD.id,
    userId: 'user-a',
    amount: 10_000,
    category: '점심',
    memo: '테스트',
    photoUri: 'https://example.test/photo.jpg',
    occurredAt: '2099-01-02T03:00:00.000Z',
    createdAt: '2099-01-02T03:00:00.000Z',
    updatedAt: '2099-01-02T03:00:00.000Z',
    syncStatus: 'SYNCED',
    version: 1,
    ...overrides,
  };
}

function commentFixture(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-default',
    clientRequestId: 'comment-request-default',
    expenseId: 'expense-default',
    userId: 'user-a',
    body: '테스트 댓글',
    createdAt: '2099-01-02T03:00:00.000Z',
    updatedAt: '2099-01-02T03:00:00.000Z',
    syncStatus: 'SYNCED',
    version: 1,
    ...overrides,
  };
}

function clone<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
