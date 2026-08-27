import { useCallback } from 'react';
import type { Period, PeriodMember, PeriodResult } from '@/shared/api/types';
import type { AppStoreState } from '@/shared/model/app-store';
import { useAppStoreSelector } from '@/shared/providers/app-store-provider';
import {
  EMPTY_MEMBERS,
  shallowArrayEqual,
  shallowArrayMapEqual,
  useIndexedArray,
  useStableIds,
} from '@/shared/providers/store-hooks';

const EMPTY_RESULTS: PeriodResult[] = [];

const selectHistory = (state: AppStoreState) => ({ pastPeriods: state.pastPeriods });

const historyEqual = (left: { pastPeriods: Period[] }, right: { pastPeriods: Period[] }) => (
  shallowArrayEqual(left.pastPeriods, right.pastPeriods)
);

export function useHistory(): { pastPeriods: Period[] } {
  return useAppStoreSelector(
    selectHistory,
    historyEqual,
  );
}

/** 방의 활성 멤버 목록(프로필 포함). 방장 위임·나가기 UI에서 쓴다. */

export function usePeriod(periodId: string | undefined): Period | undefined {
  const selector = useCallback(
    (state: AppStoreState) => periodId ? state.indexes.periodById.get(periodId) : undefined,
    [periodId],
  );
  return useAppStoreSelector(selector);
}

export function usePeriodMembers(periodId: string | undefined): PeriodMember[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        periodId ? state.indexes.membersByPeriodId.get(periodId) ?? EMPTY_MEMBERS : EMPTY_MEMBERS
      ),
      [periodId],
    ),
  );
}

/**
 * 이 주차에 내가 참여하기 시작한 시각. 중도 합류자에게 합류 전 기록을
 * 새 것으로 보여 주지 않기 위한 경계로 쓴다.
 */
export function useMyPeriodJoinedAt(
  periodId: string | undefined,
  currentUserId: string | undefined,
): string | undefined {
  return useAppStoreSelector(
    useCallback((state: AppStoreState) => (
      periodId && currentUserId
        ? state.indexes.membersByPeriodId
          .get(periodId)
          ?.find((member) => member.userId === currentUserId)
          ?.joinedAt
        : undefined
    ), [currentUserId, periodId]),
  );
}

export function useResultsForPeriods(
  periodIds: readonly string[],
): ReadonlyMap<string, PeriodResult[]> {
  const normalizedIds = useStableIds(periodIds);
  const selector = useCallback((state: AppStoreState) => {
    const results = new Map<string, PeriodResult[]>();
    normalizedIds.forEach((periodId) => {
      results.set(
        periodId,
        state.indexes.resultsByPeriodId.get(periodId) ?? EMPTY_RESULTS,
      );
    });
    return results;
  }, [normalizedIds]);
  return useAppStoreSelector(selector, shallowArrayMapEqual);
}

export function usePeriodResults(periodId: string | undefined): PeriodResult[] {
  return useIndexedArray(
    useCallback(
      (state: AppStoreState) => (
        periodId ? state.indexes.resultsByPeriodId.get(periodId) ?? EMPTY_RESULTS : EMPTY_RESULTS
      ),
      [periodId],
    ),
  );
}

/** 정산에서 제외되는(만장일치 승인된 예외) 지출 ID 집합. 참조가 안정적이다. */
