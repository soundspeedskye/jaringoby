import { describe, expect, it } from 'vitest';

import {
  getIsoWeekday,
  getNextWeekStart,
  getWeekStart,
  isWeekday,
  isWeekend,
  resolveFirstWeekStart,
} from '@/domain/week';

// Anchor week: 2026-07-20 is a Monday.
describe('getIsoWeekday', () => {
  it.each([
    ['2026-07-20', 1],
    ['2026-07-22', 3],
    ['2026-07-24', 5],
    ['2026-07-25', 6],
    ['2026-07-26', 7],
  ])('maps %s to ISO weekday %i', (date, weekday) => {
    expect(getIsoWeekday(date)).toBe(weekday);
  });

  it('rejects an invalid date', () => {
    expect(() => getIsoWeekday('2026-02-30')).toThrow(RangeError);
  });
});

describe('isWeekend / isWeekday', () => {
  it('treats Saturday and Sunday as the weekend', () => {
    expect(isWeekend('2026-07-25')).toBe(true);
    expect(isWeekend('2026-07-26')).toBe(true);
    expect(isWeekday('2026-07-25')).toBe(false);
  });

  it('treats Monday through Friday as weekdays', () => {
    expect(isWeekday('2026-07-20')).toBe(true);
    expect(isWeekday('2026-07-24')).toBe(true);
    expect(isWeekend('2026-07-22')).toBe(false);
  });
});

describe('getWeekStart', () => {
  it('returns the same date for a Monday', () => {
    expect(getWeekStart('2026-07-20')).toBe('2026-07-20');
  });

  it('returns the containing week Monday for a mid-week date', () => {
    expect(getWeekStart('2026-07-22')).toBe('2026-07-20');
  });

  it('keeps Sunday inside the ISO week that started the previous Monday', () => {
    expect(getWeekStart('2026-07-26')).toBe('2026-07-20');
  });

  it('crosses a month boundary backwards when needed', () => {
    // 2026-08-01 is a Saturday; its ISO week began on Monday 2026-07-27.
    expect(getWeekStart('2026-08-01')).toBe('2026-07-27');
  });
});

describe('getNextWeekStart', () => {
  it('returns the following Monday from any day of the week', () => {
    expect(getNextWeekStart('2026-07-20')).toBe('2026-07-27');
    expect(getNextWeekStart('2026-07-24')).toBe('2026-07-27');
    expect(getNextWeekStart('2026-07-26')).toBe('2026-07-27');
  });
});

// D6: weekday creation starts this week; weekend creation waits for Monday.
describe('resolveFirstWeekStart', () => {
  it('starts this week when created on a weekday, even mid-week', () => {
    expect(resolveFirstWeekStart('2026-07-20')).toBe('2026-07-20');
    expect(resolveFirstWeekStart('2026-07-22')).toBe('2026-07-20');
    expect(resolveFirstWeekStart('2026-07-24')).toBe('2026-07-20');
  });

  it('starts next Monday when created on the weekend', () => {
    expect(resolveFirstWeekStart('2026-07-25')).toBe('2026-07-27');
    expect(resolveFirstWeekStart('2026-07-26')).toBe('2026-07-27');
  });
});
