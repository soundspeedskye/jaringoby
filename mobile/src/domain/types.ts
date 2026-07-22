export type LocalDate = `${number}-${number}-${number}`;
export type InstantInput = Date | number | string;

export const CHALLENGE_PHASES = [
  'WAITING',
  'ACTIVE',
  'ADJUSTMENT',
  'SETTLEMENT',
  'ARCHIVED',
] as const;

export type ChallengePhase = (typeof CHALLENGE_PHASES)[number];

export const MEMBER_STATUSES = [
  'ACTIVE',
  'LEFT',
  'REMOVED',
  'ACCOUNT_DELETED',
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  '점심',
  '커피',
  '간식',
  '저녁',
  '필수품',
  '사치품',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ChallengeTimeline {
  /** Start date at 00:00 Asia/Seoul. */
  readonly S: number;
  /** The day after the inclusive end date at 00:00 Asia/Seoul. */
  readonly E: number;
  /** Expense correction deadline, E + 12 hours. */
  readonly C: number;
  /** Finalization/archive boundary, E + 48 hours. */
  readonly F: number;
}
