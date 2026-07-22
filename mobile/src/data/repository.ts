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

export type UpdateExpenseOptions = {
  /** Deterministic Storage path used to recognize a response-lost photo update. */
  expectedPhotoPath?: string;
};

export interface AppRepository {
  load(): Promise<AppSnapshot>;
  resetDemo(): Promise<AppSnapshot>;
  createChallenge(input: CreateChallengeInput): Promise<Challenge>;
  increaseCapacity(challengeId: string, capacity: number): Promise<Challenge>;
  previewInvite(inviteCode: string): Promise<InvitePreview>;
  joinChallenge(inviteCode: string, joinedAt?: string): Promise<ChallengeMember>;
  addExpense(input: AddExpenseInput): Promise<Expense>;
  updateExpense(
    expenseId: string,
    patch: Partial<AddExpenseInput>,
    options?: UpdateExpenseOptions,
  ): Promise<Expense>;
  deleteExpense(expenseId: string): Promise<void>;
  addComment(input: AddCommentInput): Promise<Comment>;
  updateComment(commentId: string, body: string): Promise<Comment>;
  deleteComment(commentId: string): Promise<void>;
  subscribe(listener: (snapshot: AppSnapshot) => void): Unsubscribe;
}

export interface SessionBoundRepository extends AppRepository {
  runAsUser<T>(
    userId: string,
    work: (repository: AppRepository) => Promise<T>,
  ): Promise<T>;
}

export interface ExpensePhotoCleanupRepository extends AppRepository {
  cleanupExpensePhoto(path: string): Promise<void>;
}

export function isSessionBoundRepository(
  repository: AppRepository,
): repository is SessionBoundRepository {
  return 'runAsUser' in repository && typeof repository.runAsUser === 'function';
}

export function supportsExpensePhotoCleanup(
  repository: AppRepository,
): repository is ExpensePhotoCleanupRepository {
  return 'cleanupExpensePhoto' in repository && typeof repository.cleanupExpensePhoto === 'function';
}
