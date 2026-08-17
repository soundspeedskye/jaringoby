import { useCallback } from 'react';
import type { Room, RoomMemberStats } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import {
  shallowMapEqual,
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';
import { useIndexedArray, useStableIds } from '@/shared/providers/store-hooks';

const EMPTY_CLOSED_ROOMS: ClosedRoomSummary[] = [];

const selectActiveRoom = (state: AppStoreState) => state.activeRoom;

export function useActiveRoom(): Room | null {
  return useAppStoreSelector(selectActiveRoom);
}

export function useRoom(roomId: string | undefined): Room | undefined {
  const selector = useCallback(
    (state: AppStoreState) => roomId ? state.indexes.roomById.get(roomId) : undefined,
    [roomId],
  );
  return useAppStoreSelector(selector);
}

export function useRooms(roomIds: readonly string[]): ReadonlyMap<string, Room> {
  const normalizedIds = useStableIds(roomIds);
  const selector = useCallback((state: AppStoreState) => {
    const rooms = new Map<string, Room>();
    normalizedIds.forEach((roomId) => {
      const room = state.indexes.roomById.get(roomId);
      if (room) rooms.set(roomId, room);
    });
    return rooms;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowMapEqual);
}

export function useRoomStats(roomId: string | undefined): RoomMemberStats[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        roomId ? state.indexes.statsByRoomId.get(roomId) ?? [] : []
      ),
      [roomId],
    ),
  );
}

export type ClosedRoomSummary = {
  id: string;
  name: string;
  memberCount: number;
  baseAmount: number;
  closedAt?: string;
};

/** 내가 속한 닫힌(지난) 방 목록. 최근 닫힌 순. 읽기 전용 요약. */

export function useClosedRooms(): ClosedRoomSummary[] {
  const selector = useCallback((state: AppStoreState): ClosedRoomSummary[] => {
    const snapshot = state.snapshot;
    const currentUserId = snapshot?.currentUserId;
    if (!snapshot || !currentUserId) return EMPTY_CLOSED_ROOMS;
    const myRoomIds = new Set(
      snapshot.roomMembers
        .filter((member) => member.userId === currentUserId)
        .map((member) => member.roomId),
    );
    const memberCountByRoom = new Map<string, number>();
    for (const member of snapshot.roomMembers) {
      memberCountByRoom.set(
        member.roomId,
        (memberCountByRoom.get(member.roomId) ?? 0) + 1,
      );
    }
    const closed = snapshot.rooms
      .filter((room) => room.status === 'CLOSED' && myRoomIds.has(room.id))
      .map((room) => ({
        id: room.id,
        name: room.name,
        memberCount: memberCountByRoom.get(room.id) ?? 0,
        baseAmount: room.baseAmount,
        closedAt: room.closedAt,
      }))
      .sort((left, right) => (right.closedAt ?? '').localeCompare(left.closedAt ?? ''));
    return closed.length ? closed : EMPTY_CLOSED_ROOMS;
  }, []);
  return useAppStoreSelector(selector, closedRoomsEqual);
}

function closedRoomsEqual(
  left: readonly ClosedRoomSummary[],
  right: readonly ClosedRoomSummary[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((value, index) => {
    const other = right[index];
    return (
      value.id === other.id &&
      value.name === other.name &&
      value.memberCount === other.memberCount &&
      value.baseAmount === other.baseAmount &&
      value.closedAt === other.closedAt
    );
  });
}
