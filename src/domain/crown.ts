import { calculateRemainingAmount } from './limits';
import type { MemberStatus, PeriodPhase } from './types';

export interface CrownMember {
  readonly memberId: string;
  readonly nickname: string;
  readonly status: MemberStatus;
  readonly appliedLimit: number;
  readonly eligibleSpending: number;
}

export type CrownMode = 'HIDDEN' | 'LIVE' | 'TENTATIVE' | 'FINAL';

export interface CrownResult {
  readonly mode: CrownMode;
  readonly maximumRemainingAmount: number | null;
  readonly holderIds: readonly string[];
}

export function getCrownMode(phase: PeriodPhase): CrownMode {
  if (phase === 'WAITING') return 'HIDDEN';
  if (phase === 'ACTIVE' || phase === 'ADJUSTMENT') return 'LIVE';
  if (phase === 'SETTLEMENT') return 'TENTATIVE';
  return 'FINAL';
}

/**
 * Selects by raw KRW remaining amount (L - X), not percentage and not Math.abs(M).
 * This makes -100 greater than -1,000 when every active member is over budget.
 */
export function selectCrownHolders(
  members: readonly CrownMember[],
  phase: PeriodPhase,
): CrownResult {
  const mode = getCrownMode(phase);
  if (mode === 'HIDDEN') {
    return Object.freeze({ mode, maximumRemainingAmount: null, holderIds: Object.freeze([]) });
  }

  const active = members
    .filter((member) => member.status === 'ACTIVE')
    .map((member) => ({
      ...member,
      remainingAmount: calculateRemainingAmount(member.appliedLimit, member.eligibleSpending),
    }));

  if (active.length === 0) {
    return Object.freeze({ mode, maximumRemainingAmount: null, holderIds: Object.freeze([]) });
  }

  const maximumRemainingAmount = Math.max(...active.map((member) => member.remainingAmount));
  const holderIds = active
    .filter((member) => member.remainingAmount === maximumRemainingAmount)
    .map((member) => member.memberId);

  return Object.freeze({
    mode,
    maximumRemainingAmount,
    holderIds: Object.freeze(holderIds),
  });
}
