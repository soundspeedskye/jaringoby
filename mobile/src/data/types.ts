import type {
  ExpenseCategory,
  LocalDate,
  MemberStatus,
  PeriodPhase,
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

export type RoomStatus = "OPEN" | "CLOSED";
export type RoomRole = "OWNER" | "MEMBER";

/** 방: 고정 설정 + 멤버십 + 초대의 소유자. 주차별 타임라인은 Period에 있다. */
export type Room = {
  id: string;
  ownerId: string;
  name: string;
  inviteCode: string;
  /** 주당 기준금액 (D2: 방 생성 시 고정). */
  baseAmount: number;
  capacity: number;
  status: RoomStatus;
  createdAt: string;
  closedAt?: string;
  clientRequestId?: string;
};

/** 방 멤버십(영속). 탈퇴 전까지 모든 주차에 자동 참여한다. */
export type RoomMember = {
  roomId: string;
  userId: string;
  role: RoomRole;
  status: MemberStatus;
  joinedAt: string;
};

/** 주차: 월~금 고정 주간 타임라인 (D1). 매주 자동 생성된다 (D7). */
export type Period = {
  id: string;
  roomId: string;
  weekIndex: number;
  weekStart: LocalDate;
  weekEnd: LocalDate;
  selectedDayCount: number;
  validDayCount: number;
  holidayDates: LocalDate[];
  holidayVersionId: string;
  phase: PeriodPhase;
  /** D5: 유효일 0인 쉬는 주. 참여자·결과·streak에 포함되지 않는다. */
  isRestWeek: boolean;
  finalizedAt?: string;
  createdAt: string;
};

/** 주차 참여자: 주차별 일할 한도 (D3/D6 proration). */
export type PeriodMember = {
  periodId: string;
  userId: string;
  joinedAt: string;
  joinedDate: LocalDate;
  eligibleDayCount: number;
  appliedLimit: number;
  status: MemberStatus;
  isLateJoiner: boolean;
};

/** 주차별 정산 스냅샷 (F 시점 확정). */
export type PeriodResult = {
  periodId: string;
  roomId: string;
  userId: string;
  nickname: string;
  appliedLimit: number;
  spentAmount: number;
  remainingAmount: number;
  achieved: boolean;
  isCrown: boolean;
  finalizedAt: string;
};

/** 누적 통계 (D4): 쉬는 주는 집계·streak 모두 제외. */
export type RoomMemberStats = {
  roomId: string;
  userId: string;
  participatedWeekCount: number;
  achievedWeekCount: number;
  crownCount: number;
  currentStreak: number;
};

export type Expense = {
  id: string;
  clientRequestId: string;
  /** 지출이 귀속되는 주차. 비우면 개인 지출. */
  periodId?: string;
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
  rooms: Room[];
  roomMembers: RoomMember[];
  periods: Period[];
  periodMembers: PeriodMember[];
  periodResults: PeriodResult[];
  memberStats: RoomMemberStats[];
  expenses: Expense[];
  comments: Comment[];
  processedRequestIds: string[];
};

export type InvitePreviewPeriod = {
  id: string;
  weekStart: LocalDate;
  weekEnd: LocalDate;
  selectedDayCount: number;
  validDayCount: number;
  holidayDates: LocalDate[];
};

export type InvitePreview = {
  code: string;
  roomId: string;
  name: string;
  baseAmount: number;
  capacity: number;
  memberCount: number;
  /** 진행 중(또는 대기 중)인 주차. 주말에는 비어 있을 수 있다. */
  currentPeriod?: InvitePreviewPeriod;
  joinedDate: LocalDate;
  eligibleDayCount: number;
  appliedLimit: number;
  isLateJoiner: boolean;
  /** false면 이번 주는 참여 없이 다음 주 월요일부터 시작한다. */
  participatesThisWeek: boolean;
  canJoin: boolean;
};

export type CreateRoomInput = {
  name: string;
  /** 주당 기준금액. */
  baseAmount: number;
  capacity: number;
  /** UUID reused when retrying the same create request. */
  clientRequestId?: string;
};

export type AddExpenseInput = Pick<
  Expense,
  "periodId" | "amount" | "category" | "memo" | "photoUri" | "occurredAt"
> & {
  clientRequestId: string;
};

export type AddCommentInput = Pick<
  Comment,
  "expenseId" | "body" | "replyToId"
> & {
  clientRequestId: string;
};
