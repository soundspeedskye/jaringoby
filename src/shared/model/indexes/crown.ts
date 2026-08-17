import type { AppSnapshot, Expense, PeriodMember, PeriodResult, Profile } from '@/shared/api/types';
import { expenseOfficialAmount } from '@/shared/api/expense-sync';
import { selectCrownHolders } from '@/shared/lib/domain/crown';
import { EMPTY_EXPENSES, EMPTY_MEMBERS } from './util';

export function buildCrownIndex(input: {
  snapshot: AppSnapshot;
  profileById: Map<string, Profile>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
  settlementExcludedExpenseIds: Set<string>;
  /** Prior crowns to reuse for finalized periods when periodResults are unchanged. */
  reuseFinalizedFrom?: Map<string, string[]>;
}): Map<string, string[]> {
  const crownIdsByPeriodId = new Map<string, string[]>();
  input.snapshot.periods.forEach((period) => {
    const {
      expensesByPeriodAndUserId,
      membersByPeriodId,
      profileById,
      resultsByPeriodId,
    } = input;
    const results = resultsByPeriodId.get(period.id);
    if (results?.length) {
      const reused = input.reuseFinalizedFrom?.get(period.id);
      crownIdsByPeriodId.set(
        period.id,
        reused ?? results.filter((result) => result.isCrown).map((result) => result.userId),
      );
      return;
    }
    const crownIds = selectCrownHolders(
      (membersByPeriodId.get(period.id) ?? EMPTY_MEMBERS).map((member) => ({
        memberId: member.userId,
        nickname: profileById.get(member.userId)?.nickname ?? '알 수 없음',
        status: member.status,
        appliedLimit: member.appliedLimit,
        eligibleSpending: (
          expensesByPeriodAndUserId.get(period.id)?.get(member.userId) ?? EMPTY_EXPENSES
        ).reduce(
          (sum, expense) =>
            input.settlementExcludedExpenseIds.has(expense.id)
              ? sum
              : sum + expenseOfficialAmount(expense),
          0,
        ),
      })),
      'ACTIVE',
    ).holderIds;
    crownIdsByPeriodId.set(period.id, [...crownIds]);
  });

  return crownIdsByPeriodId;
}

export function crownInputsAreShared(
  snapshot: AppSnapshot,
  previousSnapshot: AppSnapshot,
): boolean {
  return snapshot.periods === previousSnapshot.periods
    && snapshot.periodResults === previousSnapshot.periodResults
    && snapshot.periodMembers === previousSnapshot.periodMembers
    && snapshot.profiles === previousSnapshot.profiles
    && snapshot.expenses === previousSnapshot.expenses
    && snapshot.expenseExceptions === previousSnapshot.expenseExceptions
    && snapshot.expenseExceptionApprovals === previousSnapshot.expenseExceptionApprovals;
}
