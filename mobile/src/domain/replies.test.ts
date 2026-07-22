import { describe, expect, it } from 'vitest';

import {
  COMMENT_MAX_CHARACTERS,
  normalizeCommentBody,
  validateCommentBody,
} from '@/domain/replies';

// The database stores btrim(body) and checks char_length(btrim(body)) between
// 1 and 500, so these tests pin the client to that exact rule.
describe('normalizeCommentBody', () => {
  it('strips leading and trailing spaces', () => {
    expect(normalizeCommentBody('  안녕하세요  ')).toBe('안녕하세요');
  });

  it('keeps newlines and tabs, which btrim does not strip', () => {
    expect(normalizeCommentBody('\n안녕\t')).toBe('\n안녕\t');
  });

  it('keeps internal spaces', () => {
    expect(normalizeCommentBody(' 오늘  점심 ')).toBe('오늘  점심');
  });
});

describe('validateCommentBody', () => {
  it('accepts ordinary text', () => {
    const result = validateCommentBody('잘 아꼈네요');
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('VALID');
    expect(result.length).toBe(6);
  });

  it.each(['', '   ', '\n\t '])('rejects the blank body %j', (body) => {
    expect(validateCommentBody(body)).toMatchObject({
      valid: false,
      reason: 'EMPTY',
    });
  });

  it('accepts exactly the maximum length', () => {
    expect(validateCommentBody('가'.repeat(COMMENT_MAX_CHARACTERS))).toMatchObject({
      valid: true,
      length: COMMENT_MAX_CHARACTERS,
    });
  });

  it('rejects one character past the maximum', () => {
    expect(validateCommentBody('가'.repeat(COMMENT_MAX_CHARACTERS + 1))).toMatchObject({
      valid: false,
      reason: 'TOO_LONG',
    });
  });

  it('ignores surrounding spaces when measuring, like btrim', () => {
    const body = `   ${'가'.repeat(COMMENT_MAX_CHARACTERS)}   `;
    expect(validateCommentBody(body)).toMatchObject({
      valid: true,
      length: COMMENT_MAX_CHARACTERS,
    });
  });

  // Regression: the previous implementation counted only non-whitespace
  // characters, so this body passed the client and was refused by the server.
  it('counts internal whitespace toward the limit', () => {
    const body = `${'가'.repeat(400)}${' '.repeat(200)}끝`;
    expect(validateCommentBody(body)).toMatchObject({
      valid: false,
      reason: 'TOO_LONG',
    });
  });

  // char_length counts code points; String.prototype.length would see 2 per emoji.
  it('counts an astral character as one, like char_length', () => {
    expect(validateCommentBody('👍'.repeat(COMMENT_MAX_CHARACTERS))).toMatchObject({
      valid: true,
      length: COMMENT_MAX_CHARACTERS,
    });
    expect(validateCommentBody('👍'.repeat(COMMENT_MAX_CHARACTERS + 1)).valid).toBe(false);
  });
});
