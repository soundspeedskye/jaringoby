import AsyncStorage from '@react-native-async-storage/async-storage';

import { createDemoSnapshot } from '@/data/demo-seed';
import type { AppRepository, Unsubscribe } from '@/data/repository';
import type {
  AddCommentInput,
  AddExpenseInput,
  AppSnapshot,
  Comment,
  CreateRoomInput,
  Expense,
  InvitePreview,
  Period,
  PeriodMember,
  PeriodResult,
  Room,
  RoomMember,
  RoomMemberStats,
} from '@/data/types';
import {
  assertKrwAmount,
  createKoreanHolidaySnapshot,
  createPeriodMemberPlan,
  createPeriodTimeline,
  createWeekdayCalendar,
  evaluateCommentMutationPermission,
  evaluateExpenseMutationPermission,
  evaluateExpenseEligibility,
  getPeriodPhase,
  getWeekStart,
  isExpenseCategory,
  isWeekday,
  normalizeCommentBody,
  resolveFirstWeekStart,
  toSeoulLocalDate,
  validateCommentBody,
  type LocalDate,
  type WeekdayCalendar,
} from '@/domain';

// v3: 방(Room)+주차(Period) 모델. 이전 challenge 스냅샷과 호환되지 않는다.
const STORAGE_KEY = 'jaringoby.snapshot.v3';

// 데모 모드는 서버 공휴일 데이터가 없으므로 공휴일 없는 주로 동작한다.
const DEMO_HOLIDAYS = createKoreanHolidaySnapshot({
  version: 'demo-empty',
  capturedAt: '2026-01-01T00:00:00+09:00',
  dates: [],
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function seoulStartOfDay(date: LocalDate): string {
  return `${date}T00:00:00+09:00`;
}

export class LocalRepository implements AppRepository {
  private snapshot: AppSnapshot | null = null;
  private listeners = new Set<(snapshot: AppSnapshot) => void>();

  async load(): Promise<AppSnapshot> {
    if (this.snapshot) return clone(this.snapshot);
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    this.snapshot = stored ? (JSON.parse(stored) as AppSnapshot) : createDemoSnapshot();
    this.refreshState(this.snapshot);
    await this.persist();
    return clone(this.snapshot);
  }

  async resetDemo(): Promise<AppSnapshot> {
    this.snapshot = createDemoSnapshot();
    this.refreshState(this.snapshot);
    await this.persist();
    return clone(this.snapshot);
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const state = await this.requireState();
    if (input.clientRequestId) {
      const duplicate = state.rooms.find(
        (room) => room.ownerId === state.currentUserId && room.clientRequestId === input.clientRequestId,
      );
      if (duplicate) return clone(duplicate);
    }
    const name = input.name.trim();
    if (!name || name.length > 40) throw new Error('방 이름은 1~40자로 입력해 주세요.');
    try {
      assertKrwAmount(input.baseAmount);
    } catch {
      throw new Error('기준금액은 1원 이상의 원 단위 정수로 입력해 주세요.');
    }
    if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 10) {
      throw new Error('정원은 1~10명으로 설정해 주세요.');
    }

    const now = new Date().toISOString();
    const today = toSeoulLocalDate(Date.now());
    const room: Room = {
      id: id('room'),
      ownerId: state.currentUserId,
      name,
      inviteCode: inviteCode(),
      baseAmount: input.baseAmount,
      capacity: input.capacity,
      status: 'OPEN',
      createdAt: now,
      clientRequestId: input.clientRequestId,
    };
    state.rooms.unshift(room);
    state.roomMembers.push({
      roomId: room.id,
      userId: state.currentUserId,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: now,
    });

    // D6: 평일 생성이면 이번 주(오늘부터 일할), 주말 생성이면 다음 주 월요일.
    const period = this.createPeriodFor(state, room, resolveFirstWeekStart(today), 1);
    this.upsertPeriodMember(state, room, period, state.currentUserId, today, now);

    if (input.clientRequestId) state.processedRequestIds.push(input.clientRequestId);
    await this.persist();
    return clone(room);
  }

  async increaseCapacity(roomId: string, capacity: number): Promise<Room> {
    const state = await this.requireState();
    const room = this.findRoom(state, roomId);
    const activeCount = this.activeRoomMemberCount(state, roomId);
    if (room.ownerId !== state.currentUserId) throw new Error('방장만 정원을 변경할 수 있어요.');
    if (room.status === 'CLOSED') throw new Error('닫힌 방은 읽기 전용이에요.');
    if (capacity < room.capacity) throw new Error('정원은 줄일 수 없고 늘리기만 할 수 있어요.');
    if (capacity < activeCount) throw new Error('현재 참여자 수보다 정원을 줄일 수 없어요.');
    if (capacity > 10) throw new Error('정원은 최대 10명이에요.');
    room.capacity = capacity;
    await this.persist();
    return clone(room);
  }

  async joinRoom(code: string, joinedAt = new Date().toISOString()): Promise<RoomMember> {
    const state = await this.requireState();
    const room = state.rooms.find((item) => item.inviteCode === code.trim().toUpperCase());
    if (!room) throw new Error('참여 코드를 확인해 주세요.');
    if (room.status === 'CLOSED') throw new Error('이미 닫힌 방이에요.');
    const existing = state.roomMembers.find(
      (member) => member.roomId === room.id && member.userId === state.currentUserId,
    );
    if (existing) throw new Error('이미 참여했거나 참여했던 방이에요.');
    if (this.activeRoomMemberCount(state, room.id) >= room.capacity) {
      throw new Error('방 정원이 가득 찼어요.');
    }

    const member: RoomMember = {
      roomId: room.id,
      userId: state.currentUserId,
      role: 'MEMBER',
      status: 'ACTIVE',
      joinedAt,
    };
    state.roomMembers.push(member);

    // D3: 현재 주차가 열려 있으면(now < E) 합류일부터 일할 참여.
    const joinedDate = toSeoulLocalDate(joinedAt);
    const currentPeriod = this.openPeriodOf(state, room.id, Date.parse(joinedAt));
    if (currentPeriod) {
      this.upsertPeriodMember(state, room, currentPeriod, state.currentUserId, joinedDate, joinedAt);
    }
    await this.persist();
    return clone(member);
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const state = await this.requireState();
    const normalized = code.trim().toUpperCase();
    const room = state.rooms.find((item) => item.inviteCode === normalized);
    if (!room) throw new Error('참여 코드를 확인해 주세요.');
    if (room.status === 'CLOSED') throw new Error('이미 닫힌 방이에요.');
    const joinedDate = toSeoulLocalDate(Date.now());
    const memberCount = this.activeRoomMemberCount(state, room.id);
    const existing = state.roomMembers.some(
      (member) => member.roomId === room.id && member.userId === state.currentUserId,
    );
    const currentPeriod = this.openPeriodOf(state, room.id, Date.now());
    const plan = currentPeriod
      ? createPeriodMemberPlan({
          calendar: this.calendarOf(currentPeriod),
          joinedOn: joinedDate,
          baseAmount: room.baseAmount,
        })
      : null;

    return {
      code: normalized,
      roomId: room.id,
      name: room.name,
      baseAmount: room.baseAmount,
      capacity: room.capacity,
      memberCount,
      currentPeriod: currentPeriod
        ? {
            id: currentPeriod.id,
            weekStart: currentPeriod.weekStart,
            weekEnd: currentPeriod.weekEnd,
            selectedDayCount: currentPeriod.selectedDayCount,
            validDayCount: currentPeriod.validDayCount,
            holidayDates: [...currentPeriod.holidayDates],
          }
        : undefined,
      joinedDate,
      eligibleDayCount: plan?.eligibleDayCount ?? 0,
      appliedLimit: plan?.appliedLimit ?? 0,
      isLateJoiner: plan?.isLateJoin ?? false,
      participatesThisWeek: plan?.participatesThisWeek ?? false,
      canJoin: !existing && memberCount < room.capacity,
    };
  }

  async leaveRoom(roomId: string, successorUserId?: string): Promise<void> {
    const state = await this.requireState();
    const room = this.findRoom(state, roomId);
    const member = state.roomMembers.find(
      (item) => item.roomId === roomId && item.userId === state.currentUserId,
    );
    if (!member || member.status !== 'ACTIVE') throw new Error('참여 중인 방이 아니에요.');

    if (member.role === 'OWNER') {
      if (!successorUserId || successorUserId === state.currentUserId) {
        throw new Error('방장이 나가려면 다른 참여자에게 방장을 넘겨야 해요.');
      }
      const successor = state.roomMembers.find(
        (item) => item.roomId === roomId && item.userId === successorUserId && item.status === 'ACTIVE',
      );
      if (!successor) throw new Error('방장을 넘길 참여자를 찾을 수 없어요.');
      member.role = 'MEMBER';
      successor.role = 'OWNER';
      room.ownerId = successorUserId;
    }
    member.status = 'LEFT';

    // 시작 전 주차에서는 행을 제거하고, 진행 중 주차에서는 LEFT로 남긴다.
    const now = Date.now();
    state.periodMembers = state.periodMembers.filter((periodMember) => {
      if (periodMember.userId !== state.currentUserId) return true;
      const period = state.periods.find((item) => item.id === periodMember.periodId);
      if (!period || period.roomId !== roomId) return true;
      return now >= createPeriodTimeline(period.weekStart).S;
    });
    for (const periodMember of state.periodMembers) {
      if (periodMember.userId !== state.currentUserId || periodMember.status !== 'ACTIVE') continue;
      const period = state.periods.find((item) => item.id === periodMember.periodId);
      if (!period || period.roomId !== roomId) continue;
      const timeline = createPeriodTimeline(period.weekStart);
      if (now >= timeline.S && now < timeline.E) periodMember.status = 'LEFT';
    }
    await this.persist();
  }

  async closeRoom(roomId: string): Promise<Room> {
    const state = await this.requireState();
    const room = this.findRoom(state, roomId);
    if (room.ownerId !== state.currentUserId) throw new Error('방장만 방을 닫을 수 있어요.');
    if (room.status === 'CLOSED') return clone(room);
    room.status = 'CLOSED';
    room.closedAt = new Date().toISOString();
    await this.persist();
    return clone(room);
  }

  async addExpense(input: AddExpenseInput): Promise<Expense> {
    const state = await this.requireState();
    const duplicate = state.expenses.find((expense) => expense.clientRequestId === input.clientRequestId);
    if (duplicate) return clone(duplicate);
    const now = new Date().toISOString();
    this.validateExpenseInput(state, input, now);
    const expense: Expense = {
      ...input,
      id: id('expense'),
      userId: state.currentUserId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'SYNCED',
    };
    state.expenses.unshift(expense);
    state.processedRequestIds.push(input.clientRequestId);
    await this.persist();
    return clone(expense);
  }

  async updateExpense(expenseId: string, patch: Partial<AddExpenseInput>): Promise<Expense> {
    const state = await this.requireState();
    const expense = this.findExpense(state, expenseId);
    if (expense.userId !== state.currentUserId) throw new Error('내 지출만 수정할 수 있어요.');
    if (patch.periodId !== undefined && patch.periodId !== expense.periodId) {
      throw new Error('등록한 주차는 변경할 수 없어요.');
    }
    if (patch.clientRequestId !== undefined && patch.clientRequestId !== expense.clientRequestId) {
      throw new Error('요청 식별자는 변경할 수 없어요.');
    }
    const now = new Date().toISOString();
    this.validateExpenseInput(state, { ...expense, ...patch }, now, expense.userId, 'UPDATE');
    Object.assign(expense, patch, { updatedAt: now });
    await this.persist();
    return clone(expense);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const state = await this.requireState();
    const expense = this.findExpense(state, expenseId);
    if (expense.userId !== state.currentUserId) throw new Error('내 지출만 삭제할 수 있어요.');
    this.assertExpenseMutationAllowed(state, expense.periodId, 'DELETE', expense.userId);
    expense.deletedAt = new Date().toISOString();
    expense.updatedAt = expense.deletedAt;
    await this.persist();
  }

  async addComment(input: AddCommentInput): Promise<Comment> {
    const state = await this.requireState();
    const duplicate = state.comments.find((comment) => comment.clientRequestId === input.clientRequestId);
    if (duplicate) return clone(duplicate);
    const now = new Date().toISOString();
    const body = normalizeValidCommentBody(input.body);
    this.assertCommentMutationAllowed(state, input.expenseId, 'CREATE', now);
    if (input.replyToId) {
      const parent = this.findComment(state, input.replyToId);
      if (parent.expenseId !== input.expenseId) throw new Error('같은 지출의 댓글에만 답글을 달 수 있어요.');
    }
    const comment: Comment = {
      ...input,
      body,
      id: id('comment'),
      userId: state.currentUserId,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'SYNCED',
    };
    state.comments.push(comment);
    state.processedRequestIds.push(input.clientRequestId);
    await this.persist();
    return clone(comment);
  }

  async updateComment(commentId: string, body: string): Promise<Comment> {
    const state = await this.requireState();
    const comment = this.findComment(state, commentId);
    const now = new Date().toISOString();
    this.assertCommentMutationAllowed(state, comment.expenseId, 'EDIT', now, comment);
    comment.body = normalizeValidCommentBody(body);
    comment.updatedAt = now;
    await this.persist();
    return clone(comment);
  }

  async deleteComment(commentId: string): Promise<void> {
    const state = await this.requireState();
    const comment = this.findComment(state, commentId);
    this.assertCommentMutationAllowed(state, comment.expenseId, 'DELETE', Date.now(), comment);
    comment.deletedAt = new Date().toISOString();
    comment.body = '삭제된 메시지입니다.';
    comment.updatedAt = comment.deletedAt;
    await this.persist();
  }

  subscribe(listener: (snapshot: AppSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    if (this.snapshot) listener(clone(this.snapshot));
    return () => this.listeners.delete(listener);
  }

  private async requireState(): Promise<AppSnapshot> {
    if (!this.snapshot) await this.load();
    this.refreshState(this.snapshot as AppSnapshot);
    return this.snapshot as AppSnapshot;
  }

  /**
   * 서버(cron)가 하는 일을 데모에서 재현한다: phase 갱신 → 마감 주차 정산 →
   * 이번 주차 자동 생성 (D7) → 누적 통계 재계산 (D4).
   */
  private refreshState(state: AppSnapshot): void {
    const nowMs = Date.now();
    for (const period of state.periods) {
      const timeline = createPeriodTimeline(period.weekStart);
      period.phase = getPeriodPhase(timeline, nowMs);
      if (period.phase === 'ARCHIVED' && !period.finalizedAt) {
        period.finalizedAt = new Date(timeline.F).toISOString();
      }
    }

    for (const period of state.periods) {
      if (period.phase !== 'ARCHIVED') continue;
      if (state.periodResults.some((result) => result.periodId === period.id)) continue;
      this.finalizePeriod(state, period);
    }

    const today = toSeoulLocalDate(nowMs);
    if (isWeekday(today)) {
      const weekStart = getWeekStart(today);
      for (const room of state.rooms) {
        if (room.status !== 'OPEN') continue;
        if (state.periods.some((period) => period.roomId === room.id && period.weekStart === weekStart)) {
          continue;
        }
        const nextIndex = Math.max(
          0,
          ...state.periods.filter((period) => period.roomId === room.id).map((period) => period.weekIndex),
        ) + 1;
        const period = this.createPeriodFor(state, room, weekStart, nextIndex);
        for (const member of state.roomMembers) {
          if (member.roomId !== room.id || member.status !== 'ACTIVE') continue;
          this.upsertPeriodMember(state, room, period, member.userId, weekStart, seoulStartOfDay(weekStart));
        }
      }
    }

    state.memberStats = computeStats(state.periods, state.periodResults);
  }

  private createPeriodFor(state: AppSnapshot, room: Room, weekStart: LocalDate, weekIndex: number): Period {
    const calendar = createWeekdayCalendar({ weekStart, holidaySnapshot: DEMO_HOLIDAYS });
    const timeline = createPeriodTimeline(weekStart);
    const period: Period = {
      id: id('period'),
      roomId: room.id,
      weekIndex,
      weekStart,
      weekEnd: calendar.weekEnd,
      selectedDayCount: calendar.selectedDayCount,
      validDayCount: calendar.validDayCount,
      holidayDates: [...calendar.excludedHolidayDates],
      holidayVersionId: DEMO_HOLIDAYS.version,
      phase: getPeriodPhase(timeline, Date.now()),
      isRestWeek: calendar.isRestWeek,
      createdAt: new Date().toISOString(),
    };
    state.periods.unshift(period);
    return period;
  }

  /** 단일 일할 경로 (D3/D6/D7): 유효일 0이면 행을 만들지 않는다. */
  private upsertPeriodMember(
    state: AppSnapshot,
    room: Room,
    period: Period,
    userId: string,
    joinedOn: LocalDate,
    joinedAt: string,
  ): PeriodMember | null {
    const existing = state.periodMembers.find(
      (member) => member.periodId === period.id && member.userId === userId,
    );
    if (existing) return existing;
    const plan = createPeriodMemberPlan({
      calendar: this.calendarOf(period),
      joinedOn,
      baseAmount: room.baseAmount,
    });
    if (!plan.participatesThisWeek) return null;
    const member: PeriodMember = {
      periodId: period.id,
      userId,
      joinedAt,
      joinedDate: plan.joinedOn,
      eligibleDayCount: plan.eligibleDayCount,
      appliedLimit: plan.appliedLimit,
      status: 'ACTIVE',
      isLateJoiner: plan.isLateJoin,
    };
    state.periodMembers.push(member);
    return member;
  }

  private finalizePeriod(state: AppSnapshot, period: Period): void {
    const members = state.periodMembers.filter((member) => member.periodId === period.id);
    if (members.length === 0) return;
    const profileById = new Map(state.profiles.map((profile) => [profile.id, profile]));
    const rows = members.map((member) => {
      const spent = state.expenses
        .filter(
          (expense) =>
            expense.periodId === period.id &&
            expense.userId === member.userId &&
            !expense.deletedAt,
        )
        .reduce((sum, expense) => sum + expense.amount, 0);
      return { member, spent, remaining: member.appliedLimit - spent };
    });
    const maxActiveRemaining = Math.max(
      ...rows.filter((row) => row.member.status === 'ACTIVE').map((row) => row.remaining),
      Number.NEGATIVE_INFINITY,
    );
    const finalizedAt = period.finalizedAt ?? new Date().toISOString();
    for (const row of rows) {
      const result: PeriodResult = {
        periodId: period.id,
        roomId: period.roomId,
        userId: row.member.userId,
        nickname: profileById.get(row.member.userId)?.nickname ?? '사용자',
        appliedLimit: row.member.appliedLimit,
        spentAmount: row.spent,
        remainingAmount: row.remaining,
        achieved: row.spent <= row.member.appliedLimit,
        isCrown: row.member.status === 'ACTIVE' && row.remaining === maxActiveRemaining,
        finalizedAt,
      };
      state.periodResults.push(result);
    }
  }

  private calendarOf(period: Period): WeekdayCalendar {
    return createWeekdayCalendar({
      weekStart: period.weekStart,
      holidaySnapshot: createKoreanHolidaySnapshot({
        version: period.holidayVersionId || 'demo-empty',
        capturedAt: period.createdAt,
        dates: period.holidayDates,
      }),
    });
  }

  /** now가 E 이전인 최신 주차 (WAITING 또는 ACTIVE). */
  private openPeriodOf(state: AppSnapshot, roomId: string, nowMs: number): Period | undefined {
    return state.periods
      .filter((period) => period.roomId === roomId && nowMs < createPeriodTimeline(period.weekStart).E)
      .sort((left, right) => right.weekStart.localeCompare(left.weekStart))[0];
  }

  private activeRoomMemberCount(state: AppSnapshot, roomId: string): number {
    return state.roomMembers.filter(
      (member) => member.roomId === roomId && member.status === 'ACTIVE',
    ).length;
  }

  private validateExpenseInput(
    state: AppSnapshot,
    input: AddExpenseInput,
    now: string,
    authorId = state.currentUserId,
    action: 'CREATE' | 'UPDATE' = 'CREATE',
  ): void {
    try {
      assertKrwAmount(input.amount);
    } catch {
      throw new Error('지출 금액은 1원 이상의 원 단위 정수로 입력해 주세요.');
    }
    if (!isExpenseCategory(input.category)) throw new Error('지출 카테고리를 확인해 주세요.');
    if (input.memo.trim().length > 200) throw new Error('메모는 200자 이내로 입력해 주세요.');
    if (!input.periodId) return;
    const period = this.findPeriod(state, input.periodId);
    const room = this.findRoom(state, period.roomId);
    if (room.status === 'CLOSED') throw new Error('닫힌 방은 읽기 전용이에요.');
    const member = state.periodMembers.find(
      (item) => item.periodId === period.id && item.userId === authorId,
    );
    if (!member) throw new Error('이번 주차에 참여하고 있지 않아요.');
    this.assertExpenseMutationAllowed(state, period.id, action, authorId);
    if (!input.photoUri?.trim()) throw new Error('주차 지출에는 사진 1장이 필요해요.');
    const timeline = createPeriodTimeline(period.weekStart);
    const eligibility = evaluateExpenseEligibility({
      expectedPeriodId: period.id,
      timeline,
      effectiveDates: this.calendarOf(period).effectiveDates,
      expense: {
        periodId: period.id,
        amount: input.amount,
        category: input.category,
        occurredAt: input.occurredAt,
        // D3: 합류일 포함 — 같은 날 합류 전 시각의 지출도 유효 (day 단위 판정).
        joinedAt: seoulStartOfDay(member.joinedDate),
        memberStatusAtRecord: member.status,
        photoCount: 1,
        photoUploadStatus: 'COMPLETE',
        photoUploadCompletedAt: now,
      },
    });
    if (!eligibility.eligible) throw new Error(expenseEligibilityMessage(eligibility.reasons[0]));
  }

  private assertExpenseMutationAllowed(
    state: AppSnapshot,
    periodId: string | undefined,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    expenseAuthorId?: string,
  ): void {
    if (!periodId) return;
    const period = this.findPeriod(state, periodId);
    const member = state.periodMembers.find(
      (item) => item.periodId === periodId && item.userId === state.currentUserId,
    );
    const decision = evaluateExpenseMutationPermission({
      action,
      now: Date.now(),
      timeline: createPeriodTimeline(period.weekStart),
      actorMemberStatus: member?.status ?? 'LEFT',
      actorId: state.currentUserId,
      expenseAuthorId,
    });
    if (!decision.allowed) throw new Error(expensePermissionMessage(decision.reason));
  }

  private assertCommentMutationAllowed(
    state: AppSnapshot,
    expenseId: string,
    action: 'CREATE' | 'EDIT' | 'DELETE',
    now: string | number,
    comment?: Comment,
  ): void {
    const expense = this.findExpense(state, expenseId);
    if (!expense.periodId) throw new Error('주차 지출에만 댓글을 남길 수 있어요.');
    const period = this.findPeriod(state, expense.periodId);
    // 댓글 권한은 주차가 아니라 방 멤버십 기준 (서버와 동일).
    const roomMember = state.roomMembers.find(
      (item) => item.roomId === period.roomId && item.userId === state.currentUserId,
    );
    const decision = evaluateCommentMutationPermission({
      action,
      now,
      timeline: createPeriodTimeline(period.weekStart),
      actorMemberStatus: roomMember?.status ?? 'LEFT',
      actorId: state.currentUserId,
      commentAuthorId: comment?.userId,
      commentCreatedAt: comment?.createdAt,
    });
    if (!decision.allowed) throw new Error(commentPermissionMessage(decision.reason));
  }

  private findRoom(state: AppSnapshot, roomId: string): Room {
    const room = state.rooms.find((item) => item.id === roomId);
    if (!room) throw new Error('방을 찾을 수 없어요.');
    return room;
  }

  private findPeriod(state: AppSnapshot, periodId: string): Period {
    const period = state.periods.find((item) => item.id === periodId);
    if (!period) throw new Error('주차를 찾을 수 없어요.');
    return period;
  }

  private findExpense(state: AppSnapshot, expenseId: string): Expense {
    const expense = state.expenses.find((item) => item.id === expenseId);
    if (!expense) throw new Error('지출 기록을 찾을 수 없어요.');
    return expense;
  }

  private findComment(state: AppSnapshot, commentId: string): Comment {
    const comment = state.comments.find((item) => item.id === commentId);
    if (!comment) throw new Error('댓글을 찾을 수 없어요.');
    return comment;
  }

  private async persist(): Promise<void> {
    if (!this.snapshot) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot));
    const next = clone(this.snapshot);
    this.listeners.forEach((listener) => listener(next));
  }
}

/** D4/D5: 쉬는 주 제외, 최근 주차부터 연속 달성 수를 센다 (서버 뷰와 동일). */
function computeStats(periods: Period[], results: PeriodResult[]): RoomMemberStats[] {
  const weekIndexByPeriod = new Map(periods.map((period) => [period.id, period.weekIndex]));
  const restPeriodIds = new Set(periods.filter((period) => period.isRestWeek).map((period) => period.id));
  const grouped = new Map<string, { weekIndex: number; achieved: boolean; isCrown: boolean }[]>();
  for (const result of results) {
    if (restPeriodIds.has(result.periodId)) continue;
    const weekIndex = weekIndexByPeriod.get(result.periodId);
    if (weekIndex === undefined) continue;
    const key = `${result.roomId} ${result.userId}`;
    const rows = grouped.get(key) ?? [];
    rows.push({ weekIndex, achieved: result.achieved, isCrown: result.isCrown });
    grouped.set(key, rows);
  }
  return [...grouped.entries()].map(([key, rows]) => {
    const [roomId, userId] = key.split(' ');
    rows.sort((left, right) => right.weekIndex - left.weekIndex);
    let currentStreak = 0;
    for (const row of rows) {
      if (!row.achieved) break;
      currentStreak += 1;
    }
    return {
      roomId,
      userId,
      participatedWeekCount: rows.length,
      achievedWeekCount: rows.filter((row) => row.achieved).length,
      crownCount: rows.filter((row) => row.isCrown).length,
      currentStreak,
    };
  });
}

/** Applies the shared rule, then stores what the server would store: btrim(body). */
function normalizeValidCommentBody(value: string): string {
  if (!validateCommentBody(value).valid) {
    throw new Error('댓글은 앞뒤 공백을 제외하고 1~500자로 입력해 주세요.');
  }
  return normalizeCommentBody(value);
}

function expensePermissionMessage(reason: string): string {
  if (reason === 'NOT_EXPENSE_AUTHOR') return '내 지출만 수정하거나 삭제할 수 있어요.';
  if (reason === 'MEMBER_NOT_ACTIVE') return '활성 참여자만 지출을 기록할 수 있어요.';
  return '지출 입력과 수정이 잠긴 기간이에요.';
}

function commentPermissionMessage(reason: string): string {
  if (reason === 'NOT_COMMENT_AUTHOR') return '내 댓글만 수정하거나 삭제할 수 있어요.';
  if (reason === 'EDIT_WINDOW_EXPIRED') return '댓글은 작성 후 5분 안에만 수정할 수 있어요.';
  if (reason === 'MEMBER_NOT_ACTIVE') return '활성 참여자만 댓글을 남길 수 있어요.';
  return '정산이 끝난 주차의 댓글은 읽기 전용이에요.';
}

function expenseEligibilityMessage(reason: string | undefined): string {
  if (reason === 'BEFORE_JOIN') return '합류 전 지출은 주차에 등록할 수 없어요.';
  if (reason === 'HOLIDAY_OR_UNSELECTED_DATE') return '평일이 아니거나 공휴일인 날짜의 지출은 포함할 수 없어요.';
  if (reason === 'OUTSIDE_PERIOD_TIME') return '주차 기간 안의 지출만 등록할 수 있어요.';
  if (reason === 'PHOTO_NOT_COMPLETE_BEFORE_C') return '보정 마감 전에 사진 저장이 완료돼야 해요.';
  return '주차 정책에 맞지 않는 지출이에요.';
}
