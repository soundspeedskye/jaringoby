import { toInstantMs, toSeoulLocalDate } from './date-time';
import { assertKrwAmount } from './limits';
import { EXPENSE_CATEGORIES } from './types';
import type {
  ExpenseCategory,
  InstantInput,
  LocalDate,
  MemberStatus,
  PeriodTimeline,
} from './types';

export const EXPENSE_INELIGIBILITY_REASONS = [
  'MEMBER_NOT_ACTIVE_AT_RECORD',
  'NOT_LINKED_TO_PERIOD',
  'OUTSIDE_PERIOD_TIME',
  'BEFORE_JOIN',
  'HOLIDAY_OR_UNSELECTED_DATE',
  'INVALID_KRW_AMOUNT',
  'INVALID_CATEGORY',
  'PHOTO_COUNT_NOT_ONE',
  'PHOTO_NOT_COMPLETE_BEFORE_C',
  'DELETED_AT_C',
  'CALCULATION_EXCLUDED_AT_C',
] as const;

export type ExpenseIneligibilityReason = (typeof EXPENSE_INELIGIBILITY_REASONS)[number];

export interface PeriodExpenseCandidate {
  readonly periodId: string | null;
  readonly amount: number;
  readonly category: string;
  readonly occurredAt: InstantInput;
  readonly joinedAt: InstantInput;
  readonly memberStatusAtRecord: MemberStatus;
  readonly photoCount: number;
  readonly photoUploadStatus: 'PENDING' | 'COMPLETE' | 'FAILED';
  readonly photoUploadCompletedAt?: InstantInput | null;
  readonly deletedAt?: InstantInput | null;
  readonly calculationExcludedAt?: InstantInput | null;
}

export interface ExpenseEligibilityResult {
  readonly eligible: boolean;
  readonly reasons: readonly ExpenseIneligibilityReason[];
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

export function evaluateExpenseEligibility(input: {
  readonly expectedPeriodId: string;
  readonly timeline: PeriodTimeline;
  readonly effectiveDates: readonly LocalDate[];
  readonly expense: PeriodExpenseCandidate;
}): ExpenseEligibilityResult {
  const { expense, timeline } = input;
  const reasons: ExpenseIneligibilityReason[] = [];
  const occurredAt = safeInstant(expense.occurredAt);
  const joinedAt = safeInstant(expense.joinedAt);

  if (expense.memberStatusAtRecord !== 'ACTIVE') {
    reasons.push('MEMBER_NOT_ACTIVE_AT_RECORD');
  }
  if (expense.periodId !== input.expectedPeriodId) {
    reasons.push('NOT_LINKED_TO_PERIOD');
  }
  if (occurredAt === null || occurredAt < timeline.S || occurredAt >= timeline.E) {
    reasons.push('OUTSIDE_PERIOD_TIME');
  }
  if (occurredAt === null || joinedAt === null || occurredAt < joinedAt) {
    reasons.push('BEFORE_JOIN');
  }
  if (
    occurredAt === null ||
    !new Set(input.effectiveDates).has(toSeoulLocalDate(occurredAt))
  ) {
    reasons.push('HOLIDAY_OR_UNSELECTED_DATE');
  }
  try {
    assertKrwAmount(expense.amount);
  } catch {
    reasons.push('INVALID_KRW_AMOUNT');
  }
  if (!isExpenseCategory(expense.category)) {
    reasons.push('INVALID_CATEGORY');
  }
  if (expense.photoCount !== 1) {
    reasons.push('PHOTO_COUNT_NOT_ONE');
  }
  const uploadCompletedAt =
    expense.photoUploadCompletedAt == null ? null : safeInstant(expense.photoUploadCompletedAt);
  if (
    expense.photoUploadStatus !== 'COMPLETE' ||
    uploadCompletedAt === null ||
    uploadCompletedAt >= timeline.C
  ) {
    reasons.push('PHOTO_NOT_COMPLETE_BEFORE_C');
  }
  if (wasEffectiveAtCutoff(expense.deletedAt, timeline.C)) {
    reasons.push('DELETED_AT_C');
  }
  if (wasEffectiveAtCutoff(expense.calculationExcludedAt, timeline.C)) {
    reasons.push('CALCULATION_EXCLUDED_AT_C');
  }

  return Object.freeze({
    eligible: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

function safeInstant(value: InstantInput): number | null {
  try {
    return toInstantMs(value);
  } catch {
    return null;
  }
}

function wasEffectiveAtCutoff(value: InstantInput | null | undefined, cutoff: number): boolean {
  if (value == null) return false;
  const instant = safeInstant(value);
  return instant !== null && instant <= cutoff;
}
