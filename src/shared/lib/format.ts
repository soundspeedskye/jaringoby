const LOCALE = 'ko-KR';
const SEOUL_TIME_ZONE = 'Asia/Seoul';

/**
 * Intl 포맷터는 만드는 비용이 크고(Hermes에서는 네이티브를 탄다) 포맷 자체보다
 * 훨씬 비싸다. 그런데 이 함수들은 목록 행마다 불린다. 옵션 조합별로 한 번만
 * 만들어 재사용하되, 첫 호출까지 미뤄 쓰지 않는 화면이 시작 비용을 물지 않게 한다.
 *
 * 날짜 표기를 새로 만들 일이 생기면 화면에서 Intl을 직접 부르지 말고 여기에 더한다.
 */
function seoulDateFormat(
  options: Intl.DateTimeFormatOptions,
): () => Intl.DateTimeFormat {
  let formatter: Intl.DateTimeFormat | undefined;
  return () => (formatter ??= new Intl.DateTimeFormat(LOCALE, {
    timeZone: SEOUL_TIME_ZONE,
    ...options,
  }));
}

const dateLabelFormat = seoulDateFormat({
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const fullDateFormat = seoulDateFormat({
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: false,
});
const localDateWithWeekdayFormat = seoulDateFormat({
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const timeLabelFormat = seoulDateFormat({
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const longDateFormat = seoulDateFormat({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const longDateWithWeekdayFormat = seoulDateFormat({
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});
const meridiemTimeFormat = seoulDateFormat({
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const boardDayFormat = seoulDateFormat({ month: 'numeric', day: 'numeric' });

let wonFormatter: Intl.NumberFormat | undefined;
const wonFormat = (): Intl.NumberFormat => (wonFormatter ??= new Intl.NumberFormat(LOCALE));

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

export function formatWon(amount: number, includeUnit = true): string {
  const formatted = wonFormat().format(Math.trunc(amount));
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

/** "8월 28일 14:30". 목록 행에서 날짜와 시각을 함께 보여줄 때. */
export function formatDateLabel(value: string | Date): string {
  return dateLabelFormat().format(toDate(value));
}

/** "2026. 8. 28. 14:30". 입력 폼처럼 연도까지 필요한 자리. */
export function formatFullDate(value: Date): string {
  return fullDateFormat().format(value);
}

/** "2026-08-18" → "8월 18일 (화)". LocalDate를 서울 기준 그대로 읽는다. */
export function formatLocalDateWithWeekday(date: string): string {
  return localDateWithWeekdayFormat().format(new Date(`${date}T00:00:00+09:00`));
}

/** 날짜별로 묶인 목록처럼 날짜가 이미 드러난 자리에서 시:분만 보여준다. */
export function formatTimeLabel(value: string | Date): string {
  return timeLabelFormat().format(toDate(value));
}

/** "2026년 8월 28일 · 오후 2:30". 게시글 상세의 작성 시각. */
export function formatPostDateTime(value: string | Date): string {
  const date = toDate(value);
  return `${longDateFormat().format(date)} · ${meridiemTimeFormat().format(date)}`;
}

/** "2026년 8월 28일 금요일 오후 2:30". 지출 발생 시각처럼 요일까지 확인시키는 자리. */
export function formatSeoulDateTime(value: Date): string {
  return `${longDateWithWeekdayFormat().format(value)} ${meridiemTimeFormat().format(value)}`;
}

/** "8. 28.". 목록에서 날짜만 짧게 스치듯 보여줄 때. */
export function formatBoardDay(value: string | Date): string {
  return boardDayFormat().format(toDate(value));
}
