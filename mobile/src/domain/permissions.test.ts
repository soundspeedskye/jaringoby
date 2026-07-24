import { describe, expect, it } from 'vitest';

import {
  COMMENT_EDIT_WINDOW_MS,
  evaluateCommentMutationPermission,
  isCommentMutationPhase,
  isExpenseMutationPhase,
} from '@/domain/permissions';
import { createPeriodTimeline } from '@/domain/period';

describe('mutation phase rules', () => {
  it.each([
    ['WAITING', false],
    ['ACTIVE', true],
    ['ADJUSTMENT', true],
    ['SETTLEMENT', false],
    ['ARCHIVED', false],
  ] as const)('marks expense mutation in %s as %s', (phase, expected) => {
    expect(isExpenseMutationPhase(phase)).toBe(expected);
  });

  it.each([
    ['WAITING', false],
    ['ACTIVE', true],
    ['ADJUSTMENT', true],
    ['SETTLEMENT', true],
    ['ARCHIVED', false],
  ] as const)('marks comment mutation in %s as %s', (phase, expected) => {
    expect(isCommentMutationPhase(phase)).toBe(expected);
  });

  it('keeps the comment edit window at five minutes', () => {
    expect(COMMENT_EDIT_WINDOW_MS).toBe(5 * 60 * 1_000);
  });

  it('allows one millisecond before the edit deadline and rejects the exact boundary', () => {
    const input = {
      action: 'EDIT',
      timeline: createPeriodTimeline('2026-07-20'),
      actorMemberStatus: 'ACTIVE',
      actorId: 'user-1',
      commentAuthorId: 'user-1',
      commentCreatedAt: '2026-07-20T12:00:00.000+09:00',
    } as const;

    expect(evaluateCommentMutationPermission({
      ...input,
      now: '2026-07-20T12:04:59.999+09:00',
    })).toEqual({ allowed: true, reason: 'ALLOWED' });
    expect(evaluateCommentMutationPermission({
      ...input,
      now: '2026-07-20T12:05:00.000+09:00',
    })).toEqual({ allowed: false, reason: 'EDIT_WINDOW_EXPIRED' });
  });
});
