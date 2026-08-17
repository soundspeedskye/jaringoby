import { useMemo } from 'react';
import type { PeriodMember } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import { useAppStoreSelector } from '@/shared/providers/app-store-provider';

export const EMPTY_MEMBERS: PeriodMember[] = [];

export function useIndexedArray<T>(selector: (state: AppStoreState) => T[]): T[] {
  return useAppStoreSelector(selector, shallowArrayEqual);
}

export function shallowArrayEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left === right || (
    left.length === right.length && left.every((value, index) => Object.is(value, right[index]))
  );
}

export function shallowArrayMapEqual<K, V>(
  left: ReadonlyMap<K, V[]>,
  right: ReadonlyMap<K, V[]>,
): boolean {
  if (left === right) return true;
  if (left.size !== right.size) return false;
  for (const [key, values] of left) {
    const nextValues = right.get(key);
    if (!nextValues || !shallowArrayEqual(values, nextValues)) return false;
  }
  return true;
}

export function useStableIds(ids: readonly string[]): readonly string[] {
  // 원본 join(정렬 없음)만 매 렌더 계산하고, 비싼 dedup+sort는 내용이
  // 바뀔 때만 useMemo 안에서 수행한다.
  const key = ids.join('\u0000');
  return useMemo(
    () => (key ? [...new Set(key.split('\u0000'))].sort() : []),
    [key],
  );
}
