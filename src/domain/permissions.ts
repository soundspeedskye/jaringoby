import { toInstantMs } from './date-time';
import { getPeriodPhase } from './period';
import type { InstantInput, MemberStatus, PeriodTimeline } from './types';

export const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 1_000;

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
  | 'NOT_COMMENT_AUTHOR'
  | 'EDIT_WINDOW_EXPIRED';

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
  readonly commentCreatedAt?: InstantInput;
}): PolicyDecision<CommentPermissionReason> {
  if (input.actorMemberStatus !== 'ACTIVE') {
    return denied('MEMBER_NOT_ACTIVE');
  }

  const phase = getPeriodPhase(input.timeline, input.now);
  if (!isCommentMutationPhase(phase)) {
    return denied('COMMENTS_LOCKED_FOR_PHASE');
  }

  if (input.action !== 'CREATE') {
    if (input.commentAuthorId == null || input.commentAuthorId !== input.actorId) {
      return denied('NOT_COMMENT_AUTHOR');
    }
  }

  if (input.action === 'EDIT') {
    if (input.commentCreatedAt == null) {
      return denied('EDIT_WINDOW_EXPIRED');
    }
    const now = toInstantMs(input.now);
    const createdAt = toInstantMs(input.commentCreatedAt);
    if (now < createdAt || now >= createdAt + COMMENT_EDIT_WINDOW_MS) {
      return denied('EDIT_WINDOW_EXPIRED');
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
