import { getChallengePhase } from './date-time';
import { evaluateJoinPermission } from './permissions';
import type { ChallengeTimeline, InstantInput } from './types';

export const DEFAULT_MAX_ACTIVE_MEMBERS = 10;
export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' as const;
const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`, 'u');

export type CapacityChangeReason =
  | 'ALLOWED'
  | 'NOT_HOST'
  | 'NOT_AN_INCREASE'
  | 'BELOW_ACTIVE_MEMBERS'
  | 'ABOVE_SERVICE_MAX';

export type InviteAdmissionReason =
  | 'ALLOWED'
  | 'INVALID_CODE'
  | 'INVITE_EXPIRED'
  | 'ROOM_FULL'
  | 'ALREADY_PARTICIPATED'
  | 'NO_EFFECTIVE_DAYS';

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidInviteCodeFormat(code: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(code));
}

export function inviteCodeMatches(submittedCode: string, currentCode: string): boolean {
  return (
    isValidInviteCodeFormat(submittedCode) &&
    isValidInviteCodeFormat(currentCode) &&
    normalizeInviteCode(submittedCode) === normalizeInviteCode(currentCode)
  );
}

export function evaluateCapacityIncrease(input: {
  readonly actorIsHost: boolean;
  readonly currentCapacity: number;
  readonly requestedCapacity: number;
  readonly activeMemberCount: number;
  readonly serviceMaximum?: number;
}): { readonly allowed: boolean; readonly reason: CapacityChangeReason } {
  const maximum = input.serviceMaximum ?? DEFAULT_MAX_ACTIVE_MEMBERS;
  for (const [name, value] of Object.entries({
    currentCapacity: input.currentCapacity,
    requestedCapacity: input.requestedCapacity,
    activeMemberCount: input.activeMemberCount,
    serviceMaximum: maximum,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer`);
    }
  }
  if (input.currentCapacity < 1 || maximum < 1) {
    throw new RangeError('currentCapacity and serviceMaximum must be positive');
  }
  if (input.activeMemberCount > input.currentCapacity) {
    throw new RangeError('activeMemberCount cannot exceed currentCapacity');
  }
  if (!input.actorIsHost) {
    return Object.freeze({ allowed: false, reason: 'NOT_HOST' });
  }
  if (input.requestedCapacity < input.activeMemberCount) {
    return Object.freeze({ allowed: false, reason: 'BELOW_ACTIVE_MEMBERS' });
  }
  if (input.requestedCapacity <= input.currentCapacity) {
    return Object.freeze({ allowed: false, reason: 'NOT_AN_INCREASE' });
  }
  if (input.requestedCapacity > maximum) {
    return Object.freeze({ allowed: false, reason: 'ABOVE_SERVICE_MAX' });
  }
  return Object.freeze({ allowed: true, reason: 'ALLOWED' });
}

export function evaluateInviteAdmission(input: {
  readonly submittedCode: string;
  readonly currentCode: string;
  readonly now: InstantInput;
  readonly timeline: ChallengeTimeline;
  readonly activeMemberCount: number;
  readonly capacity: number;
  readonly hasParticipatedBefore: boolean;
  readonly remainingEffectiveDays: number;
}): { readonly allowed: boolean; readonly reason: InviteAdmissionReason } {
  if (!inviteCodeMatches(input.submittedCode, input.currentCode)) {
    return Object.freeze({ allowed: false, reason: 'INVALID_CODE' });
  }

  const phase = getChallengePhase(input.timeline, input.now);
  if (phase !== 'WAITING' && phase !== 'ACTIVE') {
    return Object.freeze({ allowed: false, reason: 'INVITE_EXPIRED' });
  }

  const join = evaluateJoinPermission(input);
  const reason = join.reason === 'JOIN_CLOSED_FOR_PHASE' ? 'INVITE_EXPIRED' : join.reason;
  return Object.freeze({ allowed: join.allowed, reason: reason as InviteAdmissionReason });
}
