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
  'exceptionByExpenseId' | 'approvedUserIdsByExpenseId' | 'settlementExcludedExpenseIds'
> {
  const exceptionByExpenseId = new Map<string, ExpenseException>();
  const approvedUserIdsByExpenseId = new Map<string, Set<string>>();

  snapshot.expenseExceptions.forEach((exception) => {
    exceptionByExpenseId.set(exception.expenseId, exception);
  });
  snapshot.expenseExceptionApprovals.forEach((approval) => {
    let approvers = approvedUserIdsByExpenseId.get(approval.expenseId);
    if (!approvers) {
      approvers = new Set<string>();
      approvedUserIdsByExpenseId.set(approval.expenseId, approvers);
    }
    approvers.add(approval.userId);
  });

  // 라이브 표시는 컷오프 없이 현재까지의 승인으로 판정한다. C 마감 적용은
  // 서버·로컬 finalize에서만(이미 승인은 C 이후 차단되므로 결과는 동일).
  const settlementExcludedExpenseIds = collectSettlementExcludedExpenseIds({
    exceptionExpenseIds: exceptionByExpenseId.keys(),
    approvals: snapshot.expenseExceptionApprovals,
    activeMemberIdsOf: (expenseId) => {
      const expense = expenseById.get(expenseId);
      if (!expense || !expense.periodId) return undefined;
      return (membersByPeriodId.get(expense.periodId) ?? EMPTY_MEMBERS)
        .filter((member) => member.status === 'ACTIVE')
        .map((member) => member.userId);
    },
  });

  return { exceptionByExpenseId, approvedUserIdsByExpenseId, settlementExcludedExpenseIds };
}

export function exceptionInputsAreShared(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot,
): boolean {
  return snapshot.expenseExceptions === previousSnapshot.expenseExceptions
    && snapshot.expenseExceptionApprovals === previousSnapshot.expenseExceptionApprovals
    && snapshot.periodMembers === previousSnapshot.periodMembers
    && snapshot.expenses === previousSnapshot.expenses;
}

export function pickExceptionIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'exceptionByExpenseId' | 'approvedUserIdsByExpenseId' | 'settlementExcludedExpenseIds'
> {
  return {
    exceptionByExpenseId: indexes.exceptionByExpenseId,
    approvedUserIdsByExpenseId: indexes.approvedUserIdsByExpenseId,
    settlementExcludedExpenseIds: indexes.settlementExcludedExpenseIds,
  };
}
