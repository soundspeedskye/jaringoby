import { toInstantMs, toSeoulLocalDate } from '@/shared/lib/domain/date-time';
import { assertKrwAmount } from '@/shared/lib/domain/limits';
import { EXPENSE_CATEGORIES } from '@/shared/model/types';
import type {
  ExpenseCategory,
  InstantInput,
  LocalDate,
  MemberStatus,
  PeriodTimeline,
} from '@/shared/model/types';

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

export const EXPENSE_EXCEPTION_REASON_MAX_LENGTH = 10;

/**
 * 예외가 정산에서 제외되려면 그 주차의 활성 멤버 전원이 승인해야 한다.
 * 제안자는 생성 시 자동 승인되므로 승인 집합에 포함된다. 활성 멤버가 없으면
 * 제외하지 않는다(정산 대상이 없음).
 */
export function isExceptionUnanimouslyApproved(input: {
  readonly activeMemberIds: readonly string[];
  readonly approvedUserIds: ReadonlySet<string>;
}): boolean {
  if (input.activeMemberIds.length === 0) return false;
  return input.activeMemberIds.every((id) => input.approvedUserIds.has(id));
}

/** 예외 승인 1건. 구조적 형태만 요구해 도메인이 데이터 타입에 의존하지 않는다. */
export type ExceptionApprovalRecord = {
  readonly expenseId: string;
  readonly userId: string;
  readonly createdAt: string;
};

/**
 * 예외가 붙은 지출들 중 "활성 멤버 전원 승인"으로 정산에서 제외되는 지출 ID 집합.
 * 라이브 인덱스와 로컬 finalize가 같은 규칙을 쓰도록 단일 구현으로 둔다.
 *
 * - `activeMemberIdsOf`가 undefined를 반환하면 그 지출은 건너뛴다(삭제·비주차 등).
 * - `cutoffMsOf`가 주어지면 그 시각 이후 승인은 무시한다(서버 finalize의 C 마감과 동일).
 *   생략하면 컷오프 없이 현재까지의 승인으로 판정한다(홈·상세의 낙관적 표시).
 */
export function collectSettlementExcludedExpenseIds(input: {
  readonly exceptionExpenseIds: Iterable<string>;
  readonly approvals: readonly ExceptionApprovalRecord[];
  readonly activeMemberIdsOf: (expenseId: string) => readonly string[] | undefined;
  readonly cutoffMsOf?: (expenseId: string) => number | undefined;
}): Set<string> {
  const approvalsByExpenseId = new Map<string, ExceptionApprovalRecord[]>();
  for (const approval of input.approvals) {
    const list = approvalsByExpenseId.get(approval.expenseId);
    if (list) list.push(approval);
    else approvalsByExpenseId.set(approval.expenseId, [approval]);
  }

  const excluded = new Set<string>();
  for (const expenseId of input.exceptionExpenseIds) {
    const activeMemberIds = input.activeMemberIdsOf(expenseId);
    if (!activeMemberIds) continue;
    const activeMemberIdSet = new Set(activeMemberIds);
    const cutoffMs = input.cutoffMsOf?.(expenseId);
    const approvedUserIds = new Set<string>();
    for (const approval of approvalsByExpenseId.get(expenseId) ?? []) {
      if (!activeMemberIdSet.has(approval.userId)) continue;
      if (cutoffMs !== undefined && Date.parse(approval.createdAt) > cutoffMs) continue;
      approvedUserIds.add(approval.userId);
    }
    if (isExceptionUnanimouslyApproved({ activeMemberIds, approvedUserIds })) {
      excluded.add(expenseId);
    }
  }
  return excluded;
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
    assertKrwAmount(expense.amount, 'amount', true);
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
