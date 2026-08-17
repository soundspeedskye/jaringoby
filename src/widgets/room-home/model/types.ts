import type { MemberListItem } from "@/entities/member/ui/member-list";
import type { WeekDay } from "@/entities/room/ui/room-hero";
import type {
  Expense,
  Period,
  PeriodMember,
  Profile,
  Room,
} from "@/shared/api/types";
import type { PeriodPhase, PeriodTimeline } from "@/shared/model/types";

/** Everything the loaded home view renders, derived from the current room state. */
export type RoomHomeData = {
  activeRoom: Room;
  currentPeriod: Period;
  currentUser: Profile;
  currentMember: PeriodMember | undefined;
  appliedLimit: number;
  daysRemaining: number;
  mySpent: number;
  myPendingDelta: number;
  myPendingCount: number;
  phase: PeriodPhase;
  timeline: PeriodTimeline;
  weekMonthLabel: string;
  weekDays: WeekDay[];
  weekRangeLabel: string;
  memberRows: MemberListItem[];
  expensesByUserId: ReadonlyMap<string, Expense[]>;
  commentCounts: ReadonlyMap<string, number>;
  recentExpenses: Expense[];
  profilesById: ReadonlyMap<string, Profile>;
  error: string | null;
};

/** Navigation and status callbacks shared across every home view state. */
export type RoomHomeActions = {
  addExpense: () => void;
  joinRoom: () => void;
  createRoom: () => void;
  clearError: () => void;
  retry: () => void;
  onOpenExpense: (expenseId: string) => void;
  onOpenMemberFeed: (userId: string) => void;
};

export type RoomHomeState =
  | { status: "loading" }
  | { status: "empty"; error: string | null }
  | { status: "ready"; data: RoomHomeData };
