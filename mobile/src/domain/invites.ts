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

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidInviteCodeFormat(code: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(code));
}

/**
 * Not wired to a screen yet: increaseCapacity exists all the way from
 * AppProvider down to the update_room_settings RPC, but no view calls it.
 * Kept so the eventual capacity screen enforces the rule here rather than
 * re-deriving it, the way the repositories currently do inline.
 */
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
