export function formatWon(amount: number, includeUnit = true): string {
  const formatted = Math.trunc(amount).toLocaleString('ko-KR');
  return includeUnit ? `${formatted}원` : formatted;
}

export function formatKrwInput(value: string): string {
  const digits = value.replace(/[^0-9]/gu, '');
  if (!digits) return '';

  const normalized = digits.replace(/^0+(?=\d)/u, '');
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
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

export function formatFullDate(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
}

/** "2026-08-18" → "8월 18일 (화)". LocalDate를 서울 기준 그대로 읽는다. */
export function formatLocalDateWithWeekday(date: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(`${date}T00:00:00+09:00`));
}

/** 날짜별로 묶인 목록처럼 날짜가 이미 드러난 자리에서 시:분만 보여준다. */
export function formatTimeLabel(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Seoul',
  }).format(date);
}
