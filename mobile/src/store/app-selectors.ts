import type { AppSnapshot, Period, Profile, Room } from '@/data/types';
import type { AppIndexes } from '@/store/app-indexes';

export type AppDerivedState = {
  currentUser: Profile | null;
  activeRoom: Room | null;
  currentPeriod: Period | null;
  pastPeriods: Period[];
};

export function deriveAppState(
  snapshot: AppSnapshot | null,
  indexes: AppIndexes,
  previousSnapshot: AppSnapshot | null = null,
  previousState?: AppDerivedState,
): AppDerivedState {
  if (!snapshot) {
    return {
      currentUser: null,
      activeRoom: null,
      currentPeriod: null,
      pastPeriods: [],
    };
  }
  const sameUser = previousSnapshot?.currentUserId === snapshot.currentUserId;
  const currentUser = previousState
    && sameUser
    && previousSnapshot?.profiles === snapshot.profiles
    ? previousState.currentUser
    : indexes.profileById.get(snapshot.currentUserId) ?? null;
  const activeRoom = previousState
    && sameUser
    && previousSnapshot?.rooms === snapshot.rooms
    && previousSnapshot.roomMembers === snapshot.roomMembers
    ? previousState.activeRoom
    : selectActiveRoom(snapshot);
  const currentPeriod = previousState
    && previousSnapshot?.periods === snapshot.periods
    && activeRoom === previousState.activeRoom
    ? previousState.currentPeriod
    : selectCurrentPeriod(snapshot, activeRoom);
  const pastPeriods = previousState
    && sameUser
    && previousSnapshot?.periods === snapshot.periods
    && previousSnapshot.roomMembers === snapshot.roomMembers
    ? previousState.pastPeriods
    : selectPastPeriods(snapshot);
  return { currentUser, activeRoom, currentPeriod, pastPeriods };
}

function selectActiveRoom(snapshot: AppSnapshot | null): Room | null {
  if (!snapshot) return null;
  const myRoomIds = new Set(
    snapshot.roomMembers
      .filter((member) => member.userId === snapshot.currentUserId && member.status === 'ACTIVE')
      .map((member) => member.roomId),
  );
  return snapshot.rooms.find((room) => myRoomIds.has(room.id) && room.status === 'OPEN') ?? null;
}

function selectCurrentPeriod(snapshot: AppSnapshot | null, activeRoom: Room | null): Period | null {
  if (!snapshot || !activeRoom) return null;
  return (
    snapshot.periods
      .filter((period) => period.roomId === activeRoom.id && period.phase !== 'ARCHIVED')
      .sort((left, right) => right.weekStart.localeCompare(left.weekStart))[0] ?? null
  );
}

function selectPastPeriods(snapshot: AppSnapshot | null): Period[] {
  if (!snapshot) return [];
  const myRoomIds = new Set(
    snapshot.roomMembers
      .filter((member) => member.userId === snapshot.currentUserId)
      .map((member) => member.roomId),
  );
  return snapshot.periods
    .filter((period) => myRoomIds.has(period.roomId) && period.phase === 'ARCHIVED')
    .sort((left, right) => right.weekStart.localeCompare(left.weekStart));
}
