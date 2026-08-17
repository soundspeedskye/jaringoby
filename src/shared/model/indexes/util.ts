import type { Expense, PeriodMember } from '@/shared/api/types';

export const EMPTY_MEMBERS: PeriodMember[] = [];
export const EMPTY_EXPENSES: Expense[] = [];

export function indexById<T extends { id: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

export function groupValues<K, V>(values: V[], keyOf: (value: V) => K): Map<K, V[]> {
  const grouped = new Map<K, V[]>();
  values.forEach((value) => appendIndexValue(grouped, keyOf(value), value));
  return grouped;
}

export function appendIndexValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key);
  if (values) values.push(value);
  else map.set(key, [value]);
}
