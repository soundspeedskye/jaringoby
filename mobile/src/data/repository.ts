import type {
  AddCommentInput,
  AddExpenseInput,
  AppSnapshot,
  Challenge,
  ChallengeMember,
  Comment,
  CreateChallengeInput,
  Expense,
  InvitePreview,
} from '@/data/types';

export type Unsubscribe = () => void;

export interface AppRepository {
  load(): Promise<AppSnapshot>;
  resetDemo(): Promise<AppSnapshot>;
  createChallenge(input: CreateChallengeInput): Promise<Challenge>;
  increaseCapacity(challengeId: string, capacity: number): Promise<Challenge>;
  previewInvite(inviteCode: string): Promise<InvitePreview>;
  joinChallenge(inviteCode: string, joinedAt?: string): Promise<ChallengeMember>;
  addExpense(input: AddExpenseInput): Promise<Expense>;
  updateExpense(expenseId: string, patch: Partial<AddExpenseInput>): Promise<Expense>;
  deleteExpense(expenseId: string): Promise<void>;
  addComment(input: AddCommentInput): Promise<Comment>;
  updateComment(commentId: string, body: string): Promise<Comment>;
  deleteComment(commentId: string): Promise<void>;
  subscribe(listener: (snapshot: AppSnapshot) => void): Unsubscribe;
}
