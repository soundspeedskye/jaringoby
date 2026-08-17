import { describe, expect, it } from 'vitest';

import {
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

  it('lets the author edit long after writing the comment', () => {
    const input = {
      action: 'EDIT',
      timeline: createPeriodTimeline('2026-07-20'),
      actorMemberStatus: 'ACTIVE',
      actorId: 'user-1',
      commentAuthorId: 'user-1',
    } as const;

    expect(evaluateCommentMutationPermission({
      ...input,
      now: '2026-07-20T12:00:00.000+09:00',
    })).toEqual({ allowed: true, reason: 'ALLOWED' });
    // 5분 편집 제한 제거 후에도 하루 뒤 편집이 열려 있어야 한다.
    expect(evaluateCommentMutationPermission({
      ...input,
      now: '2026-07-21T12:00:00.000+09:00',
    })).toEqual({ allowed: true, reason: 'ALLOWED' });
  });

  it('still blocks editing once the period is archived', () => {
    expect(evaluateCommentMutationPermission({
      action: 'EDIT',
      timeline: createPeriodTimeline('2026-07-20'),
      actorMemberStatus: 'ACTIVE',
      actorId: 'user-1',
      commentAuthorId: 'user-1',
      now: '2026-08-01T12:00:00.000+09:00',
    })).toEqual({ allowed: false, reason: 'COMMENTS_LOCKED_FOR_PHASE' });
  });

  it('still blocks editing someone else’s comment', () => {
    expect(evaluateCommentMutationPermission({
      action: 'EDIT',
      timeline: createPeriodTimeline('2026-07-20'),
      actorMemberStatus: 'ACTIVE',
      actorId: 'user-1',
      commentAuthorId: 'user-2',
      now: '2026-07-20T12:00:00.000+09:00',
    })).toEqual({ allowed: false, reason: 'NOT_COMMENT_AUTHOR' });
  });
});
