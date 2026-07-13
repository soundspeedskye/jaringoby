import { getChallengePhase, toInstantMs } from './date-time';
import type { ChallengeTimeline, InstantInput } from './types';

export interface ArchivedChallengeState<Snapshot> {
  readonly challengeId: string;
  readonly phase: 'ARCHIVED';
  readonly readOnly: true;
  /** Completion is deterministic at F even if the transition worker runs later. */
  readonly finalizedAt: number;
  readonly autoExpiresAt: null;
  readonly snapshot: Readonly<Snapshot>;
}

export function createArchiveState<Snapshot>(input: {
  readonly challengeId: string;
  readonly timeline: ChallengeTimeline;
  readonly now: InstantInput;
  readonly snapshot: Snapshot;
}): ArchivedChallengeState<Snapshot> {
  if (!input.challengeId.trim()) {
    throw new RangeError('challengeId is required');
  }
  if (getChallengePhase(input.timeline, input.now) !== 'ARCHIVED') {
    throw new RangeError('Challenge cannot be archived before F');
  }
  // Keep the same challenge identifier: completed rooms transition state instead of being cloned.
  return Object.freeze({
    challengeId: input.challengeId,
    phase: 'ARCHIVED' as const,
    readOnly: true as const,
    finalizedAt: input.timeline.F,
    autoExpiresAt: null,
    snapshot: input.snapshot,
  });
}

export function canReadArchive(input: {
  readonly isRoomMember: boolean;
  readonly hiddenFromOwnList: boolean;
}): boolean {
  // Hiding affects only discovery in the owner's list, not membership or retained shared data.
  return input.isRoomMember;
}

export function isFinalizedAt(input: {
  readonly timeline: ChallengeTimeline;
  readonly now: InstantInput;
}): boolean {
  return toInstantMs(input.now) >= input.timeline.F;
}
