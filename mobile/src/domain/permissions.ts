import { getChallengePhase, toInstantMs } from './date-time';
import type { ChallengeTimeline, InstantInput, MemberStatus } from './types';

export type ExpenseMutationAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'PHOTO_REUPLOAD';
export type CommentMutationAction = 'CREATE' | 'EDIT' | 'DELETE';

export type ExpensePermissionReason =
  | 'ALLOWED'
  | 'MEMBER_NOT_ACTIVE'
  | 'EXPENSES_LOCKED_FOR_PHASE'
  | 'NOT_EXPENSE_AUTHOR';

export type JoinPermissionReason =
  | 'ALLOWED'
  | 'JOIN_CLOSED_FOR_PHASE'
  | 'ROOM_FULL'
  | 'ALREADY_PARTICIPATED'
  | 'NO_EFFECTIVE_DAYS';

export type CommentPermissionReason =
  | 'ALLOWED'
  | 'MEMBER_NOT_ACTIVE'
  | 'COMMENTS_LOCKED_FOR_PHASE'
  | 'NOT_COMMENT_AUTHOR'
  | 'EDIT_WINDOW_EXPIRED';

export interface PolicyDecision<Reason extends string> {
  readonly allowed: boolean;
  readonly reason: Reason;
}

export function evaluateExpenseMutationPermission(input: {
  readonly action: ExpenseMutationAction;
  readonly now: InstantInput;
  readonly timeline: ChallengeTimeline;
  readonly actorMemberStatus: MemberStatus;
  readonly actorId: string;
  readonly expenseAuthorId?: string;
}): PolicyDecision<ExpensePermissionReason> {
  if (input.actorMemberStatus !== 'ACTIVE') {
    return denied('MEMBER_NOT_ACTIVE');
  }

  const phase = getChallengePhase(input.timeline, input.now);
  if (phase !== 'ACTIVE' && phase !== 'ADJUSTMENT') {
    return denied('EXPENSES_LOCKED_FOR_PHASE');
  }

  if (
    input.action !== 'CREATE' &&
    (input.expenseAuthorId == null || input.expenseAuthorId !== input.actorId)
  ) {
    return denied('NOT_EXPENSE_AUTHOR');
  }

  return allowed();
}

export function evaluateJoinPermission(input: {
  readonly now: InstantInput;
  readonly timeline: ChallengeTimeline;
  readonly activeMemberCount: number;
  readonly capacity: number;
  readonly hasParticipatedBefore: boolean;
  readonly remainingEffectiveDays: number;
}): PolicyDecision<JoinPermissionReason> {
  assertCapacityCounts(input.activeMemberCount, input.capacity);
  if (!Number.isInteger(input.remainingEffectiveDays) || input.remainingEffectiveDays < 0) {
    throw new RangeError('remainingEffectiveDays must be a non-negative integer');
  }

  const phase = getChallengePhase(input.timeline, input.now);
  if (phase !== 'WAITING' && phase !== 'ACTIVE') {
    return denied('JOIN_CLOSED_FOR_PHASE');
  }
  if (input.hasParticipatedBefore) {
    return denied('ALREADY_PARTICIPATED');
  }
  if (input.activeMemberCount >= input.capacity) {
    return denied('ROOM_FULL');
  }
  if (input.remainingEffectiveDays === 0) {
    return denied('NO_EFFECTIVE_DAYS');
  }
  return allowed();
}

export function evaluateCommentMutationPermission(input: {
  readonly action: CommentMutationAction;
  readonly now: InstantInput;
  readonly timeline: ChallengeTimeline;
  readonly actorMemberStatus: MemberStatus;
  readonly actorId: string;
  readonly commentAuthorId?: string;
  readonly commentCreatedAt?: InstantInput;
}): PolicyDecision<CommentPermissionReason> {
  if (input.actorMemberStatus !== 'ACTIVE') {
    return denied('MEMBER_NOT_ACTIVE');
  }

  const phase = getChallengePhase(input.timeline, input.now);
  if (phase === 'WAITING' || phase === 'ARCHIVED') {
    return denied('COMMENTS_LOCKED_FOR_PHASE');
  }

  if (input.action !== 'CREATE') {
    if (input.commentAuthorId == null || input.commentAuthorId !== input.actorId) {
      return denied('NOT_COMMENT_AUTHOR');
    }
  }

  if (input.action === 'EDIT') {
    if (input.commentCreatedAt == null) {
      return denied('EDIT_WINDOW_EXPIRED');
    }
    const now = toInstantMs(input.now);
    const createdAt = toInstantMs(input.commentCreatedAt);
    if (now < createdAt || now > createdAt + 5 * 60 * 1_000) {
      return denied('EDIT_WINDOW_EXPIRED');
    }
  }

  return allowed();
}

export const IMMUTABLE_CHALLENGE_FIELDS = [
  'startDate',
  'endDate',
  'selectedDates',
  'dateSelectionMode',
  'baseAmount',
  'currency',
  'timeZone',
  'holidaySnapshot',
] as const;

export type ImmutableChallengeField = (typeof IMMUTABLE_CHALLENGE_FIELDS)[number];

export function isChallengeFieldMutable(field: string): boolean {
  return !(IMMUTABLE_CHALLENGE_FIELDS as readonly string[]).includes(field);
}

export function isReadOnlyChallengePhase(phase: ReturnType<typeof getChallengePhase>): boolean {
  return phase === 'ARCHIVED';
}

function assertCapacityCounts(activeMemberCount: number, capacity: number): void {
  if (!Number.isInteger(activeMemberCount) || activeMemberCount < 0) {
    throw new RangeError('activeMemberCount must be a non-negative integer');
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('capacity must be a positive integer');
  }
}

function allowed(): PolicyDecision<'ALLOWED'> {
  return Object.freeze({ allowed: true, reason: 'ALLOWED' });
}

function denied<Reason extends string>(reason: Reason): PolicyDecision<Reason> {
  return Object.freeze({ allowed: false, reason });
}
