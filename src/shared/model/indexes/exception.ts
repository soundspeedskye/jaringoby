import type { AppSnapshot, Expense, ExpenseException, PeriodMember } from '@/shared/api/types';
import { collectSettlementExcludedExpenseIds } from '@/shared/lib/domain/expenses';
import type { AppIndexes } from './types';
import { EMPTY_MEMBERS } from './util';

export function buildExceptionIndexes(
  snapshot: AppSnapshot,
  membersByPeriodId: Map<string, PeriodMember[]>,
  expenseById: Map<string, Expense>,
): Pick<
  AppIndexes,
  | 'exceptionByExpenseId'
  | 'approvedUserIdsByExpenseId'
  | 'heldUserIdsByExpenseId'
  | 'settlementExcludedExpenseIds'
> {
  const exceptionByExpenseId = new Map<string, ExpenseException>();
  const approvedUserIdsByExpenseId = new Map<string, Set<string>>();
  const heldUserIdsByExpenseId = new Map<string, Set<string>>();

  snapshot.expenseExceptions.forEach((exception) => {
    exceptionByExpenseId.set(exception.expenseId, exception);
  });
  snapshot.expenseExceptionResponses.forEach((response) => {
    const index = response.decision === 'APPROVED'
      ? approvedUserIdsByExpenseId
      : heldUserIdsByExpenseId;
    let userIds = index.get(response.expenseId);
    if (!userIds) {
      userIds = new Set<string>();
      index.set(response.expenseId, userIds);
    }
    userIds.add(response.userId);
  });

  // 라이브 표시는 컷오프 없이 현재까지의 승인으로 판정한다. C 마감 적용은
  // 서버·로컬 finalize에서만(이미 승인은 C 이후 차단되므로 결과는 동일).
  const settlementExcludedExpenseIds = collectSettlementExcludedExpenseIds({
    exceptionExpenseIds: exceptionByExpenseId.keys(),
    responses: snapshot.expenseExceptionResponses,
    requesterIdOf: (expenseId) => exceptionByExpenseId.get(expenseId)?.requestedBy,
    activeMemberIdsOf: (expenseId) => {
      const expense = expenseById.get(expenseId);
      if (!expense || !expense.periodId) return undefined;
      return (membersByPeriodId.get(expense.periodId) ?? EMPTY_MEMBERS)
        .filter((member) => member.status === 'ACTIVE')
        .map((member) => member.userId);
    },
  });

  return {
    exceptionByExpenseId,
    approvedUserIdsByExpenseId,
    heldUserIdsByExpenseId,
    settlementExcludedExpenseIds,
  };
}

export function exceptionInputsAreShared(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot,
): boolean {
  return snapshot.expenseExceptions === previousSnapshot.expenseExceptions
    && snapshot.expenseExceptionResponses === previousSnapshot.expenseExceptionResponses
    && snapshot.periodMembers === previousSnapshot.periodMembers
    && snapshot.expenses === previousSnapshot.expenses;
}

export function pickExceptionIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  | 'exceptionByExpenseId'
  | 'approvedUserIdsByExpenseId'
  | 'heldUserIdsByExpenseId'
  | 'settlementExcludedExpenseIds'
> {
  return {
    exceptionByExpenseId: indexes.exceptionByExpenseId,
    approvedUserIdsByExpenseId: indexes.approvedUserIdsByExpenseId,
    heldUserIdsByExpenseId: indexes.heldUserIdsByExpenseId,
    settlementExcludedExpenseIds: indexes.settlementExcludedExpenseIds,
  };
}
