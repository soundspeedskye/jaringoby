export const DEFAULT_MAX_ACTIVE_MEMBERS = 10;
export const ROOM_NAME_MAX_CHARACTERS = 40;
export const INVITE_CODE_LENGTH = 6;
export const INVITE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' as const;
const INVITE_CODE_PATTERN = new RegExp(`^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`, 'u');

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidInviteCodeFormat(code: string): boolean {
  return INVITE_CODE_PATTERN.test(normalizeInviteCode(code));
}

export function generateInviteCode(random: () => number = Math.random): string {
  return Array.from({ length: INVITE_CODE_LENGTH }, () => {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
      throw new RangeError('random must return a finite number between 0 and 1');
    }
    return INVITE_CODE_ALPHABET[Math.floor(sample * INVITE_CODE_ALPHABET.length)];
  }).join('');
}

export function isValidRoomName(name: string): boolean {
  const length = Array.from(name.trim()).length;
  return length >= 1 && length <= ROOM_NAME_MAX_CHARACTERS;
}

export function isValidRoomCapacity(
  capacity: number,
  maximum = DEFAULT_MAX_ACTIVE_MEMBERS,
): boolean {
  return (
    Number.isInteger(maximum)
    && maximum >= 1
    && Number.isInteger(capacity)
    && capacity >= 1
    && capacity <= maximum
  );
}
