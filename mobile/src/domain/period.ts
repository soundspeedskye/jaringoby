import { addLocalDays, compareLocalDates, startOfSeoulDate, toInstantMs } from './date-time';
import type { KoreanHolidaySnapshot } from './holidays';
import { calculateAppliedLimit } from './limits';
import type { InstantInput, LocalDate, PeriodPhase, PeriodTimeline } from './types';
import { getIsoWeekday } from './week';

const HOUR_MS = 60 * 60 * 1_000;

/** D1: periods are fixed Mon-Fri weeks. */
export const PERIOD_WEEKDAY_COUNT = 5;

export function getPeriodPhase(
  timeline: PeriodTimeline,
  now: InstantInput,
): PeriodPhase {
  const instant = toInstantMs(now);
  if (instant < timeline.S) return 'WAITING';
  if (instant < timeline.E) return 'ACTIVE';
  if (instant < timeline.C) return 'ADJUSTMENT';
  if (instant < timeline.F) return 'SETTLEMENT';
  return 'ARCHIVED';
}

export interface PeriodDay {
  readonly date: LocalDate;
  readonly isHoliday: boolean;
}

export interface WeekdayCalendar {
  readonly weekStart: LocalDate;
  readonly weekEnd: LocalDate;
  /** The week's five weekdays in order, with holiday flags. */
  readonly days: readonly PeriodDay[];
  /** Always 5 (D1); the denominator of the limit formula. */
  readonly selectedDayCount: number;
  /** 유효일 = 평일 − 평일에 걸린 공휴일 (집합 연산, D5 allows 0). */
  readonly validDayCount: number;
  readonly effectiveDates: readonly LocalDate[];
  readonly excludedHolidayDates: readonly LocalDate[];
  /** D5: an all-holiday week is still a period, but nobody participates. */
  readonly isRestWeek: boolean;
  readonly holidaySnapshot: KoreanHolidaySnapshot;
}

/**
 * Builds the Mon-Fri calendar for one period week. Weekend holidays in the
 * snapshot can never double-deduct because only weekdays are generated.
 */
export function createWeekdayCalendar(input: {
  readonly weekStart: LocalDate | string;
  readonly holidaySnapshot: KoreanHolidaySnapshot;
}): WeekdayCalendar {
  if (getIsoWeekday(input.weekStart) !== 1) {
    throw new RangeError('A period week must start on a Monday');
  }

  const weekStart = input.weekStart as LocalDate;
  const holidays = new Set(input.holidaySnapshot.dates);
  const days = Array.from({ length: PERIOD_WEEKDAY_COUNT }, (_, index) => {
    const date = addLocalDays(weekStart, index);
    return Object.freeze({ date, isHoliday: holidays.has(date) });
  });

  const effectiveDates = days.filter((day) => !day.isHoliday).map((day) => day.date);
  const excludedHolidayDates = days.filter((day) => day.isHoliday).map((day) => day.date);

  return Object.freeze({
    weekStart,
    weekEnd: addLocalDays(weekStart, PERIOD_WEEKDAY_COUNT - 1),
    days: Object.freeze(days),
    selectedDayCount: PERIOD_WEEKDAY_COUNT,
    validDayCount: effectiveDates.length,
    effectiveDates: Object.freeze(effectiveDates),
    excludedHolidayDates: Object.freeze(excludedHolidayDates),
    isRestWeek: effectiveDates.length === 0,
    holidaySnapshot: input.holidaySnapshot,
  });
}

/**
 * D1/D7 timeline: S = Monday 00:00 KST, E = Friday 24:00 (= Saturday 00:00),
 * C = E + 12h, F = E + 48h. F lands exactly on the next week's Monday 00:00,
 * which is also when the next period opens.
 */
export function createPeriodTimeline(weekStart: LocalDate | string): PeriodTimeline {
  if (getIsoWeekday(weekStart) !== 1) {
    throw new RangeError('A period week must start on a Monday');
  }

  const S = startOfSeoulDate(weekStart);
  const E = startOfSeoulDate(addLocalDays(weekStart, PERIOD_WEEKDAY_COUNT));
  return Object.freeze({
    S,
    E,
    C: E + 12 * HOUR_MS,
    F: E + 48 * HOUR_MS,
  });
}

/** 남은 유효 평일 수, 합류일 포함 (D3: joined day counts toward the limit). */
export function countRemainingEligibleDays(
  calendar: WeekdayCalendar,
  fromDate: LocalDate | string,
): number {
  return calendar.effectiveDates.filter((date) => compareLocalDates(date, fromDate) >= 0).length;
}

export interface PeriodMemberPlan {
  /** joinedOn clamped into the week (never before weekStart). */
  readonly joinedOn: LocalDate;
  readonly isLateJoin: boolean;
  readonly eligibleDayCount: number;
  /** 적용한도 = 기준금액 × 유효일 / 선택일 (D2 formula, floor division). */
  readonly appliedLimit: number;
  /** False when no eligible days remain: participation starts next week. */
  readonly participatesThisWeek: boolean;
}

/**
 * The single proration path shared by room creation (D6), mid-week joins (D3)
 * and the weekly Monday expansion (D7) — mirrors the server's
 * upsert_period_member.
 */
export function createPeriodMemberPlan(input: {
  readonly calendar: WeekdayCalendar;
  readonly joinedOn: LocalDate | string;
  readonly baseAmount: number;
}): PeriodMemberPlan {
  const joinedOn =
    compareLocalDates(input.joinedOn, input.calendar.weekStart) > 0
      ? (input.joinedOn as LocalDate)
      : input.calendar.weekStart;

  const eligibleDayCount = countRemainingEligibleDays(input.calendar, joinedOn);
  const appliedLimit =
    eligibleDayCount > 0
      ? calculateAppliedLimit({
          baseAmount: input.baseAmount,
          totalSelectedDays: input.calendar.selectedDayCount,
          remainingEffectiveDays: eligibleDayCount,
        })
      : 0;

  return Object.freeze({
    joinedOn,
    isLateJoin: compareLocalDates(joinedOn, input.calendar.weekStart) > 0,
    eligibleDayCount,
    appliedLimit,
    participatesThisWeek: eligibleDayCount > 0,
  });
}
