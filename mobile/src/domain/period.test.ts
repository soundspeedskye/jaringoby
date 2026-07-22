import { describe, expect, it } from 'vitest';

import { createKoreanHolidaySnapshot } from '@/domain/holidays';
import { startOfSeoulDate } from '@/domain/date-time';
import {
  countRemainingEligibleDays,
  createPeriodMemberPlan,
  createPeriodTimeline,
  createWeekdayCalendar,
  getPeriodPhase,
  PERIOD_WEEKDAY_COUNT,
} from '@/domain/period';

// Anchor week: Monday 2026-07-20 … Friday 2026-07-24.
const WEEK_START = '2026-07-20';

function snapshotOf(dates: readonly string[]) {
  return createKoreanHolidaySnapshot({
    version: 'test-fixture',
    capturedAt: '2026-07-01T00:00:00+09:00',
    dates,
  });
}

describe('createWeekdayCalendar', () => {
  it('produces the five weekdays of the week in order', () => {
    const calendar = createWeekdayCalendar({
      weekStart: WEEK_START,
      holidaySnapshot: snapshotOf([]),
    });

    expect(calendar.days.map((day) => day.date)).toEqual([
      '2026-07-20',
      '2026-07-21',
      '2026-07-22',
      '2026-07-23',
      '2026-07-24',
    ]);
    expect(calendar.weekEnd).toBe('2026-07-24');
    expect(calendar.selectedDayCount).toBe(PERIOD_WEEKDAY_COUNT);
    expect(calendar.validDayCount).toBe(5);
    expect(calendar.isRestWeek).toBe(false);
  });

  it('deducts a weekday holiday from the valid day count', () => {
    const calendar = createWeekdayCalendar({
      weekStart: WEEK_START,
      holidaySnapshot: snapshotOf(['2026-07-22']),
    });

    expect(calendar.validDayCount).toBe(4);
    expect(calendar.excludedHolidayDates).toEqual(['2026-07-22']);
    expect(calendar.effectiveDates).toContain('2026-07-21');
    expect(calendar.effectiveDates).not.toContain('2026-07-22');
  });

  // 이중차감 금지: a Saturday holiday must not reduce the weekday count.
  it('ignores weekend holidays entirely', () => {
    const calendar = createWeekdayCalendar({
      weekStart: WEEK_START,
      holidaySnapshot: snapshotOf(['2026-07-25', '2026-07-26']),
    });

    expect(calendar.validDayCount).toBe(5);
    expect(calendar.excludedHolidayDates).toEqual([]);
  });

  // D5: an all-holiday week still builds as a rest week instead of throwing.
  it('builds an all-holiday week as a rest week', () => {
    const calendar = createWeekdayCalendar({
      weekStart: WEEK_START,
      holidaySnapshot: snapshotOf([
        '2026-07-20',
        '2026-07-21',
        '2026-07-22',
        '2026-07-23',
        '2026-07-24',
      ]),
    });

    expect(calendar.validDayCount).toBe(0);
    expect(calendar.isRestWeek).toBe(true);
    expect(calendar.effectiveDates).toEqual([]);
  });

  it('rejects a week start that is not a Monday', () => {
    expect(() =>
      createWeekdayCalendar({ weekStart: '2026-07-21', holidaySnapshot: snapshotOf([]) }),
    ).toThrow(RangeError);
  });
});

describe('createPeriodTimeline', () => {
  const timeline = createPeriodTimeline(WEEK_START);

  it('spans Monday 00:00 KST to Friday 24:00 KST', () => {
    expect(timeline.S).toBe(startOfSeoulDate('2026-07-20'));
    expect(timeline.E).toBe(startOfSeoulDate('2026-07-25'));
  });

  it('places C twelve hours and F forty-eight hours after E', () => {
    expect(timeline.C - timeline.E).toBe(12 * 60 * 60 * 1_000);
    expect(timeline.F - timeline.E).toBe(48 * 60 * 60 * 1_000);
  });

  // D7: F is exactly the next week's Monday 00:00, when the next period opens.
  it('lands F on the next Monday 00:00 KST', () => {
    expect(timeline.F).toBe(startOfSeoulDate('2026-07-27'));
  });

  it('rejects a week start that is not a Monday', () => {
    expect(() => createPeriodTimeline('2026-07-24')).toThrow(RangeError);
  });
});

describe('getPeriodPhase', () => {
  const timeline = createPeriodTimeline(WEEK_START);

  it.each([
    ['2026-07-19T23:00:00+09:00', 'WAITING'],
    ['2026-07-20T00:00:00+09:00', 'ACTIVE'],
    ['2026-07-24T23:59:59+09:00', 'ACTIVE'],
    ['2026-07-25T00:00:00+09:00', 'ADJUSTMENT'],
    ['2026-07-25T12:00:00+09:00', 'SETTLEMENT'],
    ['2026-07-27T00:00:00+09:00', 'ARCHIVED'],
  ])('derives %s as %s', (now, phase) => {
    expect(getPeriodPhase(timeline, now)).toBe(phase);
  });
});

describe('countRemainingEligibleDays', () => {
  const calendar = createWeekdayCalendar({
    weekStart: WEEK_START,
    holidaySnapshot: snapshotOf(['2026-07-23']),
  });

  it('counts the from-date itself (오늘 포함)', () => {
    expect(countRemainingEligibleDays(calendar, '2026-07-22')).toBe(2);
  });

  it('skips holidays after the from-date', () => {
    expect(countRemainingEligibleDays(calendar, '2026-07-23')).toBe(1);
  });

  it('returns zero once the week is exhausted', () => {
    expect(countRemainingEligibleDays(calendar, '2026-07-25')).toBe(0);
  });
});

describe('createPeriodMemberPlan', () => {
  // Doc example: 기준 5만, 평일 5·공휴일 1 → 적용한도 4만.
  it('applies the D2 formula for a full-week participant', () => {
    const plan = createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: WEEK_START,
        holidaySnapshot: snapshotOf(['2026-07-22']),
      }),
      joinedOn: WEEK_START,
      baseAmount: 50_000,
    });

    expect(plan.eligibleDayCount).toBe(4);
    expect(plan.appliedLimit).toBe(40_000);
    expect(plan.isLateJoin).toBe(false);
    expect(plan.participatesThisWeek).toBe(true);
  });

  // D3/D6 share one proration path: joining Wednesday leaves Wed-Fri.
  it('prorates a mid-week join from the join day inclusive', () => {
    const plan = createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: WEEK_START,
        holidaySnapshot: snapshotOf([]),
      }),
      joinedOn: '2026-07-22',
      baseAmount: 50_000,
    });

    expect(plan.joinedOn).toBe('2026-07-22');
    expect(plan.isLateJoin).toBe(true);
    expect(plan.eligibleDayCount).toBe(3);
    expect(plan.appliedLimit).toBe(30_000);
  });

  it('excludes holidays from a prorated join', () => {
    const plan = createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: WEEK_START,
        holidaySnapshot: snapshotOf(['2026-07-23']),
      }),
      joinedOn: '2026-07-22',
      baseAmount: 50_000,
    });

    expect(plan.eligibleDayCount).toBe(2);
    expect(plan.appliedLimit).toBe(20_000);
  });

  it('clamps a join date before the week to a full-week start', () => {
    const plan = createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: WEEK_START,
        holidaySnapshot: snapshotOf([]),
      }),
      joinedOn: '2026-07-18',
      baseAmount: 50_000,
    });

    expect(plan.joinedOn).toBe(WEEK_START);
    expect(plan.isLateJoin).toBe(false);
    expect(plan.appliedLimit).toBe(50_000);
  });

  it('floors the prorated limit like the server integer division', () => {
    const plan = createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: WEEK_START,
        holidaySnapshot: snapshotOf([]),
      }),
      joinedOn: '2026-07-24',
      baseAmount: 33_333,
    });

    // 33333 * 1 / 5 = 6666.6 → 6666
    expect(plan.appliedLimit).toBe(6_666);
  });

  // D5: a rest week (or a Friday-holiday late join) defers to next week.
  it('marks a member with no remaining eligible days as not participating', () => {
    const plan = createPeriodMemberPlan({
      calendar: createWeekdayCalendar({
        weekStart: WEEK_START,
        holidaySnapshot: snapshotOf(['2026-07-24']),
      }),
      joinedOn: '2026-07-24',
      baseAmount: 50_000,
    });

    expect(plan.eligibleDayCount).toBe(0);
    expect(plan.appliedLimit).toBe(0);
    expect(plan.participatesThisWeek).toBe(false);
  });
});
