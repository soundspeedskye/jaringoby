import { describe, expect, it } from 'vitest';

import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  isValidInviteCodeFormat,
  normalizeInviteCode,
} from '@/domain/invites';

describe('normalizeInviteCode', () => {
  it('trims surrounding whitespace and upper-cases', () => {
    expect(normalizeInviteCode('  save55 ')).toBe('SAVE55');
  });
});

describe('isValidInviteCodeFormat', () => {
  it('accepts a code built from the alphabet', () => {
    expect(isValidInviteCodeFormat('SAVE55')).toBe(true);
  });

  it('accepts lower-case input because it normalizes first', () => {
    expect(isValidInviteCodeFormat('save55')).toBe(true);
  });

  it('rejects codes that are not exactly the required length', () => {
    expect(isValidInviteCodeFormat('SAVE5')).toBe(false);
    expect(isValidInviteCodeFormat('SAVE555')).toBe(false);
  });

  // Regression: the join screen once suggested "SAVE50" as its placeholder, a
  // code the alphabet can never produce.
  it('rejects a code containing a digit the alphabet excludes', () => {
    expect(isValidInviteCodeFormat('SAVE50')).toBe(false);
  });

  // The join screen tells users that 0/1/I/L/O are unusable; keep that copy honest.
  it.each(['0', '1', 'I', 'L', 'O'])(
    'rejects the visually ambiguous character %s',
    (character) => {
      expect(INVITE_CODE_ALPHABET).not.toContain(character);
      expect(isValidInviteCodeFormat(`${character}AVE50`)).toBe(false);
    },
  );

  it('has an alphabet and length consistent with the codes it accepts', () => {
    expect(INVITE_CODE_LENGTH).toBe(6);
    const everyCharacterCode = INVITE_CODE_ALPHABET.slice(0, INVITE_CODE_LENGTH);
    expect(isValidInviteCodeFormat(everyCharacterCode)).toBe(true);
  });
});
