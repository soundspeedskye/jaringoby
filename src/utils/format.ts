export function formatWon(amount: number, includeUnit = true): string {
  const formatted = Math.trunc(amount).toLocaleString('ko-KR');
  return includeUnit ? `${formatted}원` : formatted;
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
