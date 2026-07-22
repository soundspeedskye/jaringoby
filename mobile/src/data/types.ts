import type {
  ChallengePhase,
  ExpenseCategory,
  LocalDate,
  MemberStatus,
} from "@/domain/types";

export type SyncStatus = "SYNCED" | "PENDING" | "FAILED";

export type Profile = {
  id: string;
  nickname: string;
  avatar: string;
  /** Short-lived URL for a private profile image, when one is configured. */
  avatarUri?: string;
  /** Private Storage object path; never render this value directly. */
  avatarPath?: string;
};

export type Challenge = {
  id: string;
  ownerId: string;
  name: string;
  inviteCode: string;
  startDate: LocalDate;
  endDate: LocalDate;
  selectedDates: LocalDate[];
  holidayDates: LocalDate[];
  holidaySnapshotVersion: string;
  baseLimit: number;
  capacity: number;
  phase: ChallengePhase;
  createdAt: string;
  archivedAt?: string;
  clientRequestId?: string;
};

export type ChallengeMember = {
  challengeId: string;
  userId: string;
  joinedAt: string;
  joinedDate: LocalDate;
  appliedLimit: number;
  status: MemberStatus;
  isLateJoiner: boolean;
};

export type Expense = {
  id: string;
  clientRequestId: string;
  challengeId?: string;
  userId: string;
  amount: number;
  category: ExpenseCategory;
  memo: string;
  photoUri?: string;
  /** Private Storage object path; never rendered directly. */
  photoPath?: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: SyncStatus;
  /** Local mutation represented by this optimistic/failed projection. */
  syncOperation?: "ADD" | "UPDATE" | "DELETE";
  /** Last server-confirmed amount while UPDATE/DELETE is not yet applied. */
  serverAmount?: number;
  /** Last server-confirmed category while UPDATE is projected locally. */
  serverCategory?: ExpenseCategory;
  version?: number;
};

export type Comment = {
  id: string;
  clientRequestId: string;
  expenseId: string;
  userId: string;
  body: string;
  replyToId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  syncStatus: SyncStatus;
  version?: number;
};

export type AppSnapshot = {
  currentUserId: string;
  profiles: Profile[];
  challenges: Challenge[];
  members: ChallengeMember[];
  expenses: Expense[];
  comments: Comment[];
  processedRequestIds: string[];
};

export type InvitePreview = {
  code: string;
  challengeId: string;
  name: string;
  startDate: LocalDate;
  endDate: LocalDate;
  baseLimit: number;
  capacity: number;
  memberCount: number;
  totalSelectedDays: number;
  effectiveDayCount: number;
  holidayDates: LocalDate[];
  joinedDate: LocalDate;
  remainingEffectiveDays: number;
  appliedLimit: number;
  isLateJoiner: boolean;
  canJoin: boolean;
};

export type CreateChallengeInput = Pick<
  Challenge,
  | "name"
  | "startDate"
  | "endDate"
  | "selectedDates"
  | "holidayDates"
  | "baseLimit"
  | "capacity"
> & {
  /** UUID reused when retrying the same create request. */
  clientRequestId?: string;
};

export type AddExpenseInput = Pick<
  Expense,
  "challengeId" | "amount" | "category" | "memo" | "photoUri" | "occurredAt"
> & {
  clientRequestId: string;
};

export type AddCommentInput = Pick<
  Comment,
  "expenseId" | "body" | "replyToId"
> & {
  clientRequestId: string;
};
