import { describe, expect, it } from 'vitest';

import {
  formatBoardDay,
  formatDateLabel,
  formatFullDate,
  formatKrwInput,
  formatLocalDateWithWeekday,
  formatMonthDay,
  formatPostDateTime,
  formatSeoulDateTime,
  formatTimeLabel,
  formatWon,
} from '@/shared/lib/format';

// 2026-08-28T05:30:00Z = 서울 2026-08-28 14:30 (금)
const INSTANT = '2026-08-28T05:30:00.000Z';

/**
 * 포맷터를 모듈 상수로 캐시하면서 출력이 달라지지 않았는지 고정한다.
 * 기대값은 캐시 전 구현이 내던 문자열을 그대로 옮겨 적은 것이다.
 */
describe('날짜·금액 포맷', () => {
  it('formatDateLabel: 월 일 24시간', () => {
    expect(formatDateLabel(INSTANT)).toBe('8월 28일 14:30');
  });

  it('formatTimeLabel: 시:분만', () => {
    expect(formatTimeLabel(INSTANT)).toBe('14:30');
  });

  it('formatFullDate: medium + 24시간', () => {
    expect(formatFullDate(new Date(INSTANT))).toBe('2026. 8. 28. 14:30');
  });

  it('formatPostDateTime: 긴 날짜 + 오전/오후', () => {
    expect(formatPostDateTime(INSTANT)).toBe('2026년 8월 28일 · 오후 2:30');
  });

  it('formatSeoulDateTime: 요일 포함 + 오전/오후', () => {
    expect(formatSeoulDateTime(new Date(INSTANT))).toBe(
      '2026년 8월 28일 금요일 오후 2:30',
    );
  });

  it('formatBoardDay: 숫자 월/일', () => {
    expect(formatBoardDay(INSTANT)).toBe('8. 28.');
  });

  it('formatLocalDateWithWeekday: LocalDate를 서울 기준으로 읽는다', () => {
    expect(formatLocalDateWithWeekday('2026-08-28')).toBe('8월 28일 (금)');
  });

  it('formatMonthDay: 문자열을 그대로 쪼갠다', () => {
    expect(formatMonthDay('2026-08-28')).toBe('8/28');
  });

  it('formatWon: 천 단위 구분과 단위', () => {
    expect(formatWon(1234567)).toBe('1,234,567원');
    expect(formatWon(1234567, false)).toBe('1,234,567');
    expect(formatWon(0)).toBe('0원');
    expect(formatWon(-1500)).toBe('-1,500원');
    // 소수는 버린다.
    expect(formatWon(1999.9)).toBe('1,999원');
  });

  it('formatKrwInput: 입력 중 숫자만 남겨 천 단위로 끊는다', () => {
    expect(formatKrwInput('12000')).toBe('12,000');
    expect(formatKrwInput('abc12,000원')).toBe('12,000');
    expect(formatKrwInput('007')).toBe('7');
    expect(formatKrwInput('')).toBe('');
  });

  it('같은 포맷터를 반복 호출해도 결과가 흔들리지 않는다', () => {
    const first = formatDateLabel(INSTANT);
    const second = formatDateLabel(INSTANT);
    expect(second).toBe(first);
  });
});
