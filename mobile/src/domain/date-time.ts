import type { InstantInput, LocalDate } from './types';

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1_000;
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

interface ParsedLocalDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function parseLocalDate(value: string): ParsedLocalDate {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid local date: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid local date: ${value}`);
  }

  return { year, month, day };
}

export function toInstantMs(value: InstantInput): number {
  const instant = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(instant)) {
    throw new RangeError('Invalid instant');
  }
  return instant;
}

export function startOfSeoulDate(value: LocalDate | string): number {
  const { year, month, day } = parseLocalDate(value);
  return Date.UTC(year, month - 1, day) - SEOUL_OFFSET_MS;
}

export function addLocalDays(value: LocalDate | string, days: number): LocalDate {
  if (!Number.isInteger(days)) {
    throw new RangeError('days must be an integer');
  }
  const { year, month, day } = parseLocalDate(value);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatUtcDate(date);
}

export function toSeoulLocalDate(value: InstantInput): LocalDate {
  return formatUtcDate(new Date(toInstantMs(value) + SEOUL_OFFSET_MS));
}

export function compareLocalDates(left: LocalDate | string, right: LocalDate | string): number {
  return startOfSeoulDate(left) - startOfSeoulDate(right);
}

function formatUtcDate(date: Date): LocalDate {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as LocalDate;
}
