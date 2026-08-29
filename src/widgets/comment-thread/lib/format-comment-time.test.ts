import { describe, expect, it } from 'vitest';

import { formatCommentTime } from './format-comment-time';

describe('formatCommentTime', () => {
  it('서울 기준 숫자 월/일과 24시간 시각을 낸다', () => {
    // 2026-08-28T05:30:00Z = 서울 2026-08-28 14:30
    expect(formatCommentTime('2026-08-28T05:30:00.000Z')).toBe('8. 28. 14:30');
  });

  it('포맷터를 재사용해도 결과가 흔들리지 않는다', () => {
    const first = formatCommentTime('2026-08-28T05:30:00.000Z');
    expect(formatCommentTime('2026-08-28T05:30:00.000Z')).toBe(first);
  });
});
