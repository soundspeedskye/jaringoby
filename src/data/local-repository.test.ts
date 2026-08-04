import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalRepository } from '@/data/local-repository';
import type { AppSnapshot } from '@/data/types';

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
