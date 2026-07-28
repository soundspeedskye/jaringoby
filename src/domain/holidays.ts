import { compareLocalDates, parseLocalDate, toInstantMs } from './date-time';
import type { InstantInput, LocalDate } from './types';

export interface KoreanHolidaySnapshot {
  readonly countryCode: 'KR';
  readonly version: string;
  readonly capturedAt: string;
  readonly dates: readonly LocalDate[];
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

function validateAndCastDate(value: LocalDate | string): LocalDate {
  parseLocalDate(value);
  return value as LocalDate;
}
