import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalRepository } from '@/data/local-repository';
import type { AppSnapshot, Period, PeriodMember } from '@/data/types';
import { buildAppIndexes } from '@/store/app-indexes';

const storage = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  },
}));

const STORAGE_KEY = 'jaringoby.snapshot.v3';

function seed(): AppSnapshot {
  return {
    currentUserId: 'user-me',
    profiles: [
      { id: 'user-me', nickname: '나', avatar: 'fox' },
      { id: 'user-x', nickname: '엑스', avatar: 'rabbit' },
      { id: 'user-y', nickname: '와이', avatar: 'panda' },
    ],
    rooms: [
      roomFixture('room-a', 'user-x', 'ROOMAA'),
      roomFixture('room-b', 'user-x', 'ROOMBB'),
      roomFixture('room-c', 'user-me', 'ROOMCC'),
    ],
    roomMembers: [
      { roomId: 'room-a', userId: 'user-x', role: 'OWNER', status: 'ACTIVE', joinedAt: '2026-07-01T00:00:00+09:00' },
      { roomId: 'room-a', userId: 'user-me', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-07-01T00:00:00+09:00' },
      { roomId: 'room-b', userId: 'user-x', role: 'OWNER', status: 'ACTIVE', joinedAt: '2026-07-01T00:00:00+09:00' },
      { roomId: 'room-c', userId: 'user-me', role: 'OWNER', status: 'ACTIVE', joinedAt: '2026-07-01T00:00:00+09:00' },
      { roomId: 'room-c', userId: 'user-y', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-07-01T00:00:00+09:00' },
    ],
    periods: [],
    periodMembers: [],
    periodResults: [],
    memberStats: [],
    expenses: [],
    comments: [],
    expenseExceptions: [],
    expenseExceptionApprovals: [],
    processedRequestIds: [],
  };
}

function roomFixture(id: string, ownerId: string, inviteCode: string) {
  return {
    id,
    ownerId,
    name: id,
    inviteCode,
    baseAmount: 50_000,
    capacity: 6,
    status: 'OPEN' as const,
    createdAt: '2026-07-01T00:00:00+09:00',
  };
}

function memberStatus(snapshot: AppSnapshot, roomId: string, userId: string) {
  return snapshot.roomMembers.find(
    (member) => member.roomId === roomId && member.userId === userId,
  );
}

describe('LocalRepository leave/switch', () => {
  beforeEach(() => {
    storage.clear();
    storage.set(STORAGE_KEY, JSON.stringify(seed()));
  });

  it('marks a non-owner membership as LEFT when leaving', async () => {
    const repository = new LocalRepository();
    await repository.leaveRoom('room-a');
    const snapshot = await repository.load();
    expect(memberStatus(snapshot, 'room-a', 'user-me')?.status).toBe('LEFT');
    // 나간 뒤에는 어떤 주차에도 활성 참여자로 남지 않는다.
    const activeInRoomA = snapshot.periodMembers.some((member) => {
      const period = snapshot.periods.find((item) => item.id === member.periodId);
      return (
        period?.roomId === 'room-a' &&
        member.userId === 'user-me' &&
        member.status === 'ACTIVE'
      );
    });
    expect(activeInRoomA).toBe(false);
  });

  it('requires a successor when the owner leaves', async () => {
    const repository = new LocalRepository();
    await expect(repository.leaveRoom('room-c')).rejects.toThrow(/방장/u);
  });

  it('transfers ownership to the chosen successor', async () => {
    const repository = new LocalRepository();
    await repository.leaveRoom('room-c', 'user-y');
    const snapshot = await repository.load();
    expect(memberStatus(snapshot, 'room-c', 'user-me')?.status).toBe('LEFT');
    expect(memberStatus(snapshot, 'room-c', 'user-y')?.role).toBe('OWNER');
    expect(snapshot.rooms.find((room) => room.id === 'room-c')?.ownerId).toBe('user-y');
  });

  it('switches rooms atomically: leaves the current room and joins the target', async () => {
    const repository = new LocalRepository();
    await repository.switchRoom({ leaveRoomId: 'room-a', joinCode: 'ROOMBB' });
    const snapshot = await repository.load();
    expect(memberStatus(snapshot, 'room-a', 'user-me')?.status).toBe('LEFT');
    const joined = memberStatus(snapshot, 'room-b', 'user-me');
    expect(joined?.status).toBe('ACTIVE');
    expect(joined?.role).toBe('MEMBER');
  });

  it('keeps the current room when the switch target code is invalid', async () => {
    const repository = new LocalRepository();
    await expect(
      repository.switchRoom({ leaveRoomId: 'room-a', joinCode: 'NOPE00' }),
    ).rejects.toThrow();
    const snapshot = await repository.load();
    // 대상 참여가 실패하면 원래 방 멤버십은 그대로여야 한다.
    expect(memberStatus(snapshot, 'room-a', 'user-me')?.status).toBe('ACTIVE');
  });
});

// 2026-08-03(월) 주차. 수요일 정오를 기준 시각으로 고정한다.
const WEEK_START = '2026-08-03';
const WEDNESDAY_NOON = new Date('2026-08-05T12:00:00+09:00');
const SATURDAY_EVENING = new Date('2026-08-08T20:00:00+09:00'); // C(토 12:00) 이후

function livePeriod(): Period {
  return {
    id: 'period-c',
    roomId: 'room-c',
    weekIndex: 1,
    weekStart: WEEK_START,
    weekEnd: '2026-08-07',
    selectedDayCount: 5,
    validDayCount: 5,
    holidayDates: [],
    holidayVersionId: 'demo-empty',
    phase: 'ACTIVE',
    isRestWeek: false,
    createdAt: '2026-08-03T00:00:00+09:00',
  };
}

function liveMember(userId: string): PeriodMember {
  return {
    periodId: 'period-c',
    userId,
    joinedAt: '2026-08-03T00:00:00+09:00',
    joinedDate: WEEK_START,
    eligibleDayCount: 5,
    appliedLimit: 50_000,
    status: 'ACTIVE',
    isLateJoiner: false,
  };
}

/** room-c에 살아있는 주차 + user-y의 예외 지출을 심는다. currentUser는 인자로. */
function seedWithException(currentUserId: string): AppSnapshot {
  const base = seed();
  base.currentUserId = currentUserId;
  base.periods = [livePeriod()];
  base.periodMembers = [liveMember('user-me'), liveMember('user-y')];
  base.expenses = [
    {
      id: 'expense-1',
      clientRequestId: 'req-1',
      periodId: 'period-c',
      userId: 'user-y',
      amount: 30_000,
      pointAmount: 0,
      category: '저녁',
      memo: '',
      occurredAt: '2026-08-05T03:00:00.000Z',
      createdAt: '2026-08-05T03:00:00.000Z',
      updatedAt: '2026-08-05T03:00:00.000Z',
      syncStatus: 'SYNCED',
    },
  ];
  base.expenseExceptions = [
    {
      expenseId: 'expense-1',
      reason: '야근',
      requestedBy: 'user-y',
      requestedAt: '2026-08-05T03:00:00.000Z',
    },
  ];
  // 제안자(user-y)는 생성 시 자동 승인된 상태.
  base.expenseExceptionApprovals = [
    { expenseId: 'expense-1', userId: 'user-y', createdAt: '2026-08-05T03:00:00.000Z' },
  ];
  return base;
}

describe('LocalRepository expense exception', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('excludes the expense from settlement once every active member approves', async () => {
    vi.useFakeTimers({ now: WEDNESDAY_NOON });
    storage.clear();
    storage.set(STORAGE_KEY, JSON.stringify(seedWithException('user-me')));

    const repository = new LocalRepository();
    const before = await repository.load();
    // user-y만 승인 → 아직 만장일치 아님.
    expect(
      buildAppIndexes(before).settlementExcludedExpenseIds.has('expense-1'),
    ).toBe(false);

    await repository.approveExpenseException('expense-1');
    const after = await repository.load();
    expect(
      buildAppIndexes(after).settlementExcludedExpenseIds.has('expense-1'),
    ).toBe(true);
  });

  it('rejects approval after the adjustment cutoff C', async () => {
    vi.useFakeTimers({ now: SATURDAY_EVENING });
    storage.clear();
    storage.set(STORAGE_KEY, JSON.stringify(seedWithException('user-me')));

    const repository = new LocalRepository();
    await expect(repository.approveExpenseException('expense-1')).rejects.toThrow(
      /마감/u,
    );
  });

  it('lets only the requester withdraw the exception', async () => {
    vi.useFakeTimers({ now: WEDNESDAY_NOON });
    storage.clear();
    storage.set(STORAGE_KEY, JSON.stringify(seedWithException('user-me')));

    const repository = new LocalRepository();
    // user-me는 제안자가 아니다.
    await expect(repository.withdrawExpenseException('expense-1')).rejects.toThrow(
      /요청/u,
    );

    const asRequester = new LocalRepository();
    storage.set(STORAGE_KEY, JSON.stringify(seedWithException('user-y')));
    await asRequester.load();
    await asRequester.withdrawExpenseException('expense-1');
    const snapshot = await asRequester.load();
    expect(snapshot.expenseExceptions).toHaveLength(0);
    expect(snapshot.expenseExceptionApprovals).toHaveLength(0);
  });
});
