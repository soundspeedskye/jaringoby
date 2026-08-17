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
  /** 사용자가 직접 고른 동물 키. 없으면 id 기반 기본 동물을 사용한다. */
  avatarKey?: string;
  avatar: string;
  /** Short-lived URL for a private profile image, when one is configured. */
  avatarUri?: string;
  /** Private Storage object path; never render this value directly. */
  avatarPath?: string;
  /** 마지막 닉네임 변경 후 다시 변경할 수 있는 서버 기준 시각. */
  nicknameChangeAvailableAt?: string;
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
  /** 실제 예산에서 차감되는 결제 금액. */
  amount: number;
  /** 포인트 사용액. 표시용이며 챌린지 예산 합계에는 포함하지 않는다. */
  pointAmount: number;
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

export const COMMENT_REACTION_EMOJIS = ["❤️", "👍", "👏"] as const;
export type CommentReactionEmoji = (typeof COMMENT_REACTION_EMOJIS)[number];

/** 한 사용자가 댓글에 남긴 이모지 반응. 같은 이모지는 댓글당 한 번만 가능하다. */
export type CommentReaction = {
  commentId: string;
  userId: string;
  emoji: CommentReactionEmoji;
  createdAt: string;
};

export type RoomPostKind = "NOTICE" | "POST";

/** 방의 이야기. 작성 당시 진행 중인 주차는 기록용 도장으로만 남긴다. */
export type RoomPost = {
  id: string;
  clientRequestId: string;
  roomId: string;
  periodId?: string;
  kind: RoomPostKind;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version?: number;
};

/** 냥냥톡톡 글에 붙는 평면 댓글. 지출 댓글과 달리 답글은 없다. */
export type RoomPostComment = {
  id: string;
  clientRequestId: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version?: number;
};

export const ROOM_POST_REACTION_EMOJIS = ["❤️", "👍", "👏"] as const;
export type RoomPostReactionEmoji = (typeof ROOM_POST_REACTION_EMOJIS)[number];

export type RoomPostReaction = {
  postId: string;
  userId: string;
  emoji: RoomPostReactionEmoji;
  createdAt: string;
};

/** 앱 안 소식함에 표시하는 사용자별 이벤트. 본문은 저장하지 않는다. */
export type AppNotification = {
  id: string;
  userId: string;
  kind: string;
  actorId?: string;
  roomId?: string;
  periodId?: string;
  expenseId?: string;
  commentId?: string;
  postId?: string;
  route: string;
  readAt?: string;
  createdAt: string;
};

/** 지출에 붙은 예외 제안. 활성 멤버 전원 승인 시 정산에서 제외된다. */
export type ExpenseException = {
  expenseId: string;
  /** 짧은 사유 (기념일·야근 등). 최대 10자. */
  reason: string;
  requestedBy: string;
  requestedAt: string;
};

/** 예외에 대한 멤버 개별 승인. (expenseId, userId) 단위. */
export type ExpenseExceptionApproval = {
  expenseId: string;
  userId: string;
  createdAt: string;
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
  commentReactions: CommentReaction[];
  roomPosts: RoomPost[];
  roomPostComments: RoomPostComment[];
  roomPostReactions: RoomPostReaction[];
  notifications: AppNotification[];
  expenseExceptions: ExpenseException[];
  expenseExceptionApprovals: ExpenseExceptionApproval[];
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

/** 방장이 바꿀 수 있는 방의 고정 설정. 기준금액은 생성 뒤 변경되지 않는다. */
export type UpdateRoomSettingsInput = {
  roomId: string;
  name: string;
  capacity: number;
};

export type SwitchRoomInput = {
  /** 지금 참여 중이라 떠나야 하는 방. */
  leaveRoomId: string;
  /** 방장이 떠날 때 방장을 넘겨받을 활성 멤버. 방장이 아니면 비운다. */
  successorId?: string;
  /** 새로 참여할 방의 참여 코드. */
  joinCode: string;
};

export type AddExpenseInput = Pick<
  Expense,
  "periodId" | "amount" | "pointAmount" | "category" | "memo" | "photoUri" | "occurredAt"
> & {
  clientRequestId: string;
  /** 예외 제안 사유(생성 시에만). 비우면 일반 지출. */
  exceptionReason?: string;
};

export type AddCommentInput = Pick<
  Comment,
  "expenseId" | "body" | "replyToId"
> & {
  clientRequestId: string;
};

export type AddRoomPostInput = {
  roomId: string;
  kind: RoomPostKind;
  body: string;
  clientRequestId: string;
};

export type AddRoomPostCommentInput = {
  postId: string;
  body: string;
  clientRequestId: string;
};
