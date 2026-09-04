import { useCallback, useMemo } from 'react';
import type { PeriodMember } from '@/shared/api/types';
import type { AppIndexes } from '@/shared/model/app-indexes';
import type { AppStoreState } from '@/shared/model/app-store';
import {
  shallowMapEqual,
  useAppStoreSelector,
} from '@/shared/providers/app-store-provider';

export const EMPTY_MEMBERS: PeriodMember[] = [];

/**
 * 인덱스에 없는 id의 조회 결과. id마다 새 배열을 만들면 equality가 걸러 주더라도
 * 스냅샷이 갱신될 때마다 쓸데없이 할당된다. 읽기 전용으로만 쓰인다.
 */
const EMPTY_LIST: never[] = [];

/**
 * 인덱스 하나를 고르는 함수. 훅 바깥(모듈 상수)에 두어야 참조가 안정적이고,
 * 그래야 셀렉터가 매 렌더 새로 만들어지지 않는다.
 */
type PickIndex<T> = (indexes: AppIndexes) => ReadonlyMap<string, T>;

type PickListIndex<T> = (indexes: AppIndexes) => ReadonlyMap<string, T[]>;

export function useIndexedArray<T>(selector: (state: AppStoreState) => T[]): T[] {
  return useAppStoreSelector(selector, shallowArrayEqual);
}

/** id 하나로 인덱스에서 값을 꺼낸다. 없으면 undefined. */
export function useIndexedValue<T>(
  pick: PickIndex<T>,
  id: string | undefined,
): T | undefined {
  return useAppStoreSelector(
    useCallback(
      (state: AppStoreState) => (id ? pick(state.indexes).get(id) : undefined),
      [id, pick],
    ),
  );
}

/**
 * id 하나로 인덱스에서 목록을 꺼낸다. 스토어가 이미 그룹해 둔 배열 참조를
 * 그대로 노출하므로, 그 그룹이 안 바뀌면 참조도 그대로다.
 */
export function useIndexedList<T>(
  pick: PickListIndex<T>,
  id: string | undefined,
): T[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        id ? pick(state.indexes).get(id) ?? EMPTY_LIST : EMPTY_LIST
      ),
      [id, pick],
    ),
  );
}

/**
 * 여러 id의 값을 id별로 묶어 꺼낸다. 인덱스에 없는 id는 빠진다.
 * 결과 Map은 매번 새로 만들어지지만, 내용이 같으면 equality가 이전 참조를 지킨다.
 */
export function useIndexedMap<T>(
  pick: PickIndex<T>,
  ids: readonly string[],
): ReadonlyMap<string, T> {
  const normalizedIds = useStableIds(ids);
  return useAppStoreSelector(
    useCallback(
      (state: AppStoreState) => {
        const index = pick(state.indexes);
        const picked = new Map<string, T>();
        normalizedIds.forEach((id) => {
          const value = index.get(id);
          if (value) picked.set(id, value);
        });
        return picked;
      },
      [normalizedIds, pick],
    ),
    shallowMapEqual,
  );
}

/** useIndexedMap의 목록 판. 값이 배열이라 비교도 배열 단위로 한다. */
export function useIndexedListMap<T>(
  pick: PickListIndex<T>,
  ids: readonly string[],
): ReadonlyMap<string, T[]> {
  const normalizedIds = useStableIds(ids);
  return useAppStoreSelector(
    useCallback(
      (state: AppStoreState) => {
        const index = pick(state.indexes);
        const grouped = new Map<string, T[]>();
        normalizedIds.forEach((id) => {
          const values = index.get(id);
          if (values) grouped.set(id, values);
        });
        return grouped;
      },
      [normalizedIds, pick],
    ),
    shallowArrayMapEqual,
  );
}

/** 인덱스가 세어 둔 건수를 id별로 모은다. 0이거나 없는 id는 빠진다. */
export function useIndexedCounts(
  pick: PickIndex<number>,
  ids: readonly string[],
): ReadonlyMap<string, number> {
  const normalizedIds = useStableIds(ids);
  return useAppStoreSelector(
    useCallback(
      (state: AppStoreState) => {
        const index = pick(state.indexes);
        const counts = new Map<string, number>();
        normalizedIds.forEach((id) => {
          const count = index.get(id);
          if (count) counts.set(id, count);
        });
        return counts;
      },
      [normalizedIds, pick],
    ),
    shallowMapEqual,
  );
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
  //
  // ref 캐시로 join을 없애려 했지만 react-compiler 린트가 렌더 중 ref 접근을
  // 막는다(정당한 규칙이라 끄지 않는다). join 비용은 그대로 두는 편이 낫다.
  const key = ids.join('\u0000');
  return useMemo(
    () => (key ? [...new Set(key.split('\u0000'))].sort() : []),
    [key],
  );
}
