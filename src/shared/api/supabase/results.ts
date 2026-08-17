import type { CommentRow, ExpenseRow } from './rows';
import { RepositoryError } from './errors';
import { hash32 } from './mappers';

/** 쿼리 결과를 다루는 잡일들. 형 변환, 가시성 필터, 멱등 키 생성. */

export function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function filterVisibleExpenseRows(
  expenseRows: ExpenseRow[],
  visiblePeriodIds: ReadonlySet<string>,
): ExpenseRow[] {
  return expenseRows.filter(
    (row) => !row.period_id || visiblePeriodIds.has(row.period_id),
  );
}

export function filterVisibleCommentRows(
  commentRows: CommentRow[],
  visibleExpenseIds: ReadonlySet<string>,
): CommentRow[] {
  return commentRows.filter((row) => visibleExpenseIds.has(row.expense_id));
}

export function collectProcessedRequestIds(
  expenseRows: ExpenseRow[],
  commentRows: CommentRow[],
  userId: string,
): string[] {
  return [
    ...expenseRows
      .filter((row) => row.user_id === userId)
      .map((row) => row.client_request_id),
    ...commentRows
      .filter((row) => row.user_id === userId)
      .map((row) => row.client_request_id),
  ];
}



export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const item of items) {
    const itemKey = key(item);
    const group = result.get(itemKey) ?? [];
    group.push(item);
    result.set(itemKey, group);
  }
  return result;
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function toRequestUuid(value: string): string {
  if (!value.trim()) {
    throw new RepositoryError('REQUEST_ID_REQUIRED', '중복 저장 방지를 위한 요청 식별자가 필요해요.');
  }
  const normalized = value.trim().toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)) {
    return normalized;
  }
  const words = [hash32(`0:${value}`), hash32(`1:${value}`), hash32(`2:${value}`), hash32(`3:${value}`)];
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function makeUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const seed = `${Date.now()}:${Math.random()}:${Math.random()}`;
  return toRequestUuid(seed);
}
