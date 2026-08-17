import { getPeriodPhase } from './period';
import type { InstantInput, MemberStatus, PeriodTimeline } from './types';

export type ExpenseMutationAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'PHOTO_REUPLOAD';
export type CommentMutationAction = 'CREATE' | 'EDIT' | 'DELETE';

export type ExpensePermissionReason =
  | 'ALLOWED'
  | 'MEMBER_NOT_ACTIVE'
  | 'EXPENSES_LOCKED_FOR_PHASE'
  | 'NOT_EXPENSE_AUTHOR';

export type CommentPermissionReason =
  | 'ALLOWED'
  | 'MEMBER_NOT_ACTIVE'
  | 'COMMENTS_LOCKED_FOR_PHASE'
  | 'NOT_COMMENT_AUTHOR';

export interface PolicyDecision<Reason extends string> {
  readonly allowed: boolean;
  readonly reason: Reason;
}

export function isExpenseMutationPhase(phase: ReturnType<typeof getPeriodPhase>): boolean {
  return phase === 'ACTIVE' || phase === 'ADJUSTMENT';
}

export function isCommentMutationPhase(phase: ReturnType<typeof getPeriodPhase>): boolean {
  return phase !== 'WAITING' && phase !== 'ARCHIVED';
}

export function evaluateExpenseMutationPermission(input: {
  readonly action: ExpenseMutationAction;
  readonly now: InstantInput;
  readonly timeline: PeriodTimeline;
  readonly actorMemberStatus: MemberStatus;
  readonly actorId: string;
  readonly expenseAuthorId?: string;
}): PolicyDecision<ExpensePermissionReason> {
  if (input.actorMemberStatus !== 'ACTIVE') {
    return denied('MEMBER_NOT_ACTIVE');
  }

  const phase = getPeriodPhase(input.timeline, input.now);
  if (!isExpenseMutationPhase(phase)) {
    return denied('EXPENSES_LOCKED_FOR_PHASE');
  }

  if (
    input.action !== 'CREATE' &&
    (input.expenseAuthorId == null || input.expenseAuthorId !== input.actorId)
  ) {
    return denied('NOT_EXPENSE_AUTHOR');
  }

  return allowed();
}

export function evaluateCommentMutationPermission(input: {
  readonly action: CommentMutationAction;
  readonly now: InstantInput;
  readonly timeline: PeriodTimeline;
  readonly actorMemberStatus: MemberStatus;
  readonly actorId: string;
  readonly commentAuthorId?: string;
}): PolicyDecision<CommentPermissionReason> {
  if (input.actorMemberStatus !== 'ACTIVE') {
    return denied('MEMBER_NOT_ACTIVE');
  }

  const phase = getPeriodPhase(input.timeline, input.now);
  if (!isCommentMutationPhase(phase)) {
    return denied('COMMENTS_LOCKED_FOR_PHASE');
  }

  // 편집 시간 제한은 두지 않는다. 작성자 본인이면 phase가 허용하는 동안 언제든
  // 고칠 수 있고, 보관된 주차(ARCHIVED)의 동결은 isCommentMutationPhase가 맡는다.
  if (input.action !== 'CREATE') {
    if (input.commentAuthorId == null || input.commentAuthorId !== input.actorId) {
      return denied('NOT_COMMENT_AUTHOR');
    }
  }

  return allowed();
}

function allowed(): PolicyDecision<'ALLOWED'> {
  return Object.freeze({ allowed: true, reason: 'ALLOWED' });
}

function denied<Reason extends string>(reason: Reason): PolicyDecision<Reason> {
  return Object.freeze({ allowed: false, reason });
}
