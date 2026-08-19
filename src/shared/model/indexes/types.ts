import type { Comment, CommentReaction, Expense, ExpenseException, Period, PeriodMember, PeriodResult, Profile, Room, RoomMemberStats, RoomPost, RoomPostComment, RoomPostPollOption, RoomPostPollVote, RoomPostReaction } from '@/shared/api/types';

export type AppIndexes = {
  roomById: Map<string, Room>;
  periodById: Map<string, Period>;
  profileById: Map<string, Profile>;
  membersByPeriodId: Map<string, PeriodMember[]>;
  expenseById: Map<string, Expense>;
  expensesByPeriodId: Map<string, Expense[]>;
  expensesByPeriodAndUserId: Map<string, Map<string, Expense[]>>;
  commentsByExpenseId: Map<string, Comment[]>;
  commentCountByExpenseId: Map<string, number>;
  reactionsByCommentId: Map<string, CommentReaction[]>;
  postById: Map<string, RoomPost>;
  postsByRoomId: Map<string, RoomPost[]>;
  commentsByPostId: Map<string, RoomPostComment[]>;
  commentCountByPostId: Map<string, number>;
  reactionsByPostId: Map<string, RoomPostReaction[]>;
  pollOptionsByPostId: Map<string, RoomPostPollOption[]>;
  pollVotesByPostId: Map<string, RoomPostPollVote[]>;
  resultsByPeriodId: Map<string, PeriodResult[]>;
  statsByRoomId: Map<string, RoomMemberStats[]>;
  crownIdsByPeriodId: Map<string, string[]>;
  exceptionByExpenseId: Map<string, ExpenseException>;
  approvedUserIdsByExpenseId: Map<string, Set<string>>;
  /** 예외가 만장일치로 승인돼 정산에서 빠지는 지출 ID(전 주차 통합). */
  settlementExcludedExpenseIds: Set<string>;
};
