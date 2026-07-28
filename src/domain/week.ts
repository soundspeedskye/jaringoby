import { addLocalDays, parseLocalDate } from './date-time';
import type { LocalDate } from './types';

/** ISO weekday number: 1 = Monday … 7 = Sunday. */
export function getIsoWeekday(value: LocalDate | string): number {
  const { year, month, day } = parseLocalDate(value);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

export function isWeekend(value: LocalDate | string): boolean {
  return getIsoWeekday(value) >= 6;
}

export function isWeekday(value: LocalDate | string): boolean {
  return !isWeekend(value);
}

/** Monday of the ISO week containing the given date. */
export function getWeekStart(value: LocalDate | string): LocalDate {
  return addLocalDays(value, 1 - getIsoWeekday(value));
}

/** Monday of the ISO week after the one containing the given date. */
export function getNextWeekStart(value: LocalDate | string): LocalDate {
  return addLocalDays(getWeekStart(value), 7);
}

/**
 * D6: creating a room on a weekday opens this week's period (prorated from
 * today); creating it on a weekend opens next Monday's full week.
 */
export function resolveFirstWeekStart(today: LocalDate | string): LocalDate {
  return isWeekend(today) ? getNextWeekStart(today) : getWeekStart(today);
}
