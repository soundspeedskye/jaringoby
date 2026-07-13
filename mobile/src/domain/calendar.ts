import { compareLocalDates, parseLocalDate, toInstantMs } from './date-time';
import type { InstantInput, LocalDate } from './types';

export interface KoreanHolidaySnapshot {
  readonly countryCode: 'KR';
  readonly version: string;
  readonly capturedAt: string;
  readonly dates: readonly LocalDate[];
}

export interface ChallengeCalendar {
  readonly selectedDates: readonly LocalDate[];
  readonly excludedHolidayDates: readonly LocalDate[];
  readonly effectiveDates: readonly LocalDate[];
  /** N: selected-day count before holiday exclusion. */
  readonly totalSelectedDays: number;
  readonly holidaySnapshot: KoreanHolidaySnapshot;
}

export function createKoreanHolidaySnapshot(input: {
  readonly version: string;
  readonly capturedAt: InstantInput;
  readonly dates: readonly (LocalDate | string)[];
}): KoreanHolidaySnapshot {
  const version = input.version.trim();
  if (!version) {
    throw new RangeError('Holiday snapshot version is required');
  }

  const uniqueDates = [...new Set(input.dates.map(validateAndCastDate))].sort(compareLocalDates);
  return Object.freeze({
    countryCode: 'KR' as const,
    version,
    capturedAt: new Date(toInstantMs(input.capturedAt)).toISOString(),
    dates: Object.freeze(uniqueDates),
  });
}

export function createChallengeCalendar(input: {
  readonly selectedDates: readonly (LocalDate | string)[];
  readonly holidaySnapshot: KoreanHolidaySnapshot;
}): ChallengeCalendar {
  if (input.selectedDates.length < 1 || input.selectedDates.length > 31) {
    throw new RangeError('A challenge must select between 1 and 31 dates');
  }

  const selectedDates = input.selectedDates.map(validateAndCastDate);
  if (new Set(selectedDates).size !== selectedDates.length) {
    throw new RangeError('Selected challenge dates must be unique');
  }
  selectedDates.sort(compareLocalDates);

  const holidays = new Set(input.holidaySnapshot.dates);
  const excludedHolidayDates = selectedDates.filter((date) => holidays.has(date));
  const effectiveDates = selectedDates.filter((date) => !holidays.has(date));

  if (effectiveDates.length === 0) {
    throw new RangeError('A challenge cannot be created when every selected date is a holiday');
  }

  return Object.freeze({
    selectedDates: Object.freeze(selectedDates),
    excludedHolidayDates: Object.freeze(excludedHolidayDates),
    effectiveDates: Object.freeze(effectiveDates),
    totalSelectedDays: selectedDates.length,
    holidaySnapshot: input.holidaySnapshot,
  });
}

function validateAndCastDate(value: LocalDate | string): LocalDate {
  parseLocalDate(value);
  return value as LocalDate;
}
