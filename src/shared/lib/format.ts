export function formatWon(amount: number, includeUnit = true): string {
  const formatted = Math.trunc(amount).toLocaleString('ko-KR');
  return includeUnit ? `${formatted}원` : formatted;
}

/** "2026-07-28" → "7/28". Parses the LocalDate string directly, no timezone math. */
export function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export function formatDateLabel(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}
