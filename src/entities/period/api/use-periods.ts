import { useCallback } from 'react';
import type { Period, PeriodMember, PeriodResult } from '@/shared/api/types';
import type { AppIndexes } from '@/shared/model/app-indexes';
import type { AppStoreState } from '@/shared/model/app-store';
import { useAppStoreSelector } from '@/shared/providers/app-store-provider';
import {
  shallowArrayEqual,
  useIndexedList,
  useIndexedListMap,
  useIndexedValue,
} from '@/shared/providers/store-hooks';

const selectHistory = (state: AppStoreState) => ({ pastPeriods: state.pastPeriods });

const historyEqual = (left: { pastPeriods: Period[] }, right: { pastPeriods: Period[] }) => (
  shallowArrayEqual(left.pastPeriods, right.pastPeriods)
);

const pickPeriodById = (indexes: AppIndexes) => indexes.periodById;

const pickMembersByPeriodId = (indexes: AppIndexes) => indexes.membersByPeriodId;

const pickResultsByPeriodId = (indexes: AppIndexes) => indexes.resultsByPeriodId;

export function useHistory(): { pastPeriods: Period[] } {
  return useAppStoreSelector(
    selectHistory,
    historyEqual,
  );
}

export function usePeriod(periodId: string | undefined): Period | undefined {
  return useIndexedValue(pickPeriodById, periodId);
}

export function usePeriodMembers(periodId: string | undefined): PeriodMember[] {
  return useIndexedList(pickMembersByPeriodId, periodId);
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
  return useIndexedListMap(pickResultsByPeriodId, periodIds);
}

export function usePeriodResults(periodId: string | undefined): PeriodResult[] {
  return useIndexedList(pickResultsByPeriodId, periodId);
}
