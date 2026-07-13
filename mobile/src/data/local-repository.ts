import AsyncStorage from '@react-native-async-storage/async-storage';

import { createDemoSnapshot } from '@/data/demo-seed';
import type { AppRepository, Unsubscribe } from '@/data/repository';
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
import {
  assertKrwAmount,
  calculateAppliedLimit,
  createChallengeCalendar,
  createChallengeTimeline,
  createKoreanHolidaySnapshot,
  evaluateCommentMutationPermission,
  evaluateExpenseEligibility,
  evaluateExpenseMutationPermission,
  evaluateJoinPermission,
  getChallengePhase,
  isExpenseCategory,
  toSeoulLocalDate,
} from '@/domain';

const STORAGE_KEY = 'jaringoby.snapshot.v2';

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

export class LocalRepository implements AppRepository {
  private snapshot: AppSnapshot | null = null;
  private listeners = new Set<(snapshot: AppSnapshot) => void>();

  async load(): Promise<AppSnapshot> {
    if (this.snapshot) return clone(this.snapshot);
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    this.snapshot = stored ? (JSON.parse(stored) as AppSnapshot) : createDemoSnapshot();
    this.refreshPhases(this.snapshot);
    await this.persist();
    return clone(this.snapshot);
  }

  async resetDemo(): Promise<AppSnapshot> {
    this.snapshot = createDemoSnapshot();
    await this.persist();
    return clone(this.snapshot);
  }

  async createChallenge(input: CreateChallengeInput): Promise<Challenge> {
    const state = await this.requireState();
    if (input.clientRequestId) {
      const duplicate = state.challenges.find(
        (challenge) => challenge.ownerId === state.currentUserId && challenge.clientRequestId === input.clientRequestId,
      );
      if (duplicate) return clone(duplicate);
    }
    const name = input.name.trim();
    if (!name || name.length > 30) throw new Error('챌린지 이름은 1~30자로 입력해 주세요.');
    try {
      assertKrwAmount(input.baseLimit);
    } catch {
      throw new Error('기준금액은 1원 이상의 원 단위 정수로 입력해 주세요.');
    }
    if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 10) {
      throw new Error('정원은 1~10명으로 설정해 주세요.');
    }
    const timeline = createChallengeTimeline({ startDate: input.startDate, endDate: input.endDate });
    const today = toSeoulLocalDate(Date.now());
    if (input.startDate < today) throw new Error('시작일은 오늘보다 이전일 수 없어요.');
    if (input.selectedDates.some((date) => date < input.startDate || date > input.endDate)) {
      throw new Error('선택일은 챌린지 기간 안에 있어야 해요.');
    }
    const holidaySnapshot = createKoreanHolidaySnapshot({
      version: `kr-local-${input.startDate}`,
      capturedAt: Date.now(),
      dates: input.holidayDates,
    });
    const calendar = createChallengeCalendar({ selectedDates: input.selectedDates, holidaySnapshot });
    const challengeId = id('challenge');
    const now = new Date().toISOString();
    const challenge: Challenge = {
      ...input,
      name,
      selectedDates: [...calendar.selectedDates],
      holidayDates: [...calendar.excludedHolidayDates],
      id: challengeId,
      ownerId: state.currentUserId,
      inviteCode: inviteCode(),
      holidaySnapshotVersion: holidaySnapshot.version,
      phase: getChallengePhase(timeline, Date.now()),
      createdAt: now,
      clientRequestId: input.clientRequestId,
    };
    const appliedLimit = calculateAppliedLimit({
      baseAmount: input.baseLimit,
      totalSelectedDays: calendar.totalSelectedDays,
      remainingEffectiveDays: calendar.effectiveDates.length,
    });
    const member: ChallengeMember = {
      challengeId,
      userId: state.currentUserId,
      joinedAt: now,
      joinedDate: input.startDate,
      appliedLimit,
      status: 'ACTIVE',
      isLateJoiner: false,
    };
    state.challenges.unshift(challenge);
    state.members.push(member);
    if (input.clientRequestId) state.processedRequestIds.push(input.clientRequestId);
    await this.persist();
    return clone(challenge);
  }

  async increaseCapacity(challengeId: string, capacity: number): Promise<Challenge> {
    const state = await this.requireState();
    const challenge = this.findChallenge(state, challengeId);
    const activeCount = state.members.filter((member) => member.challengeId === challengeId && member.status === 'ACTIVE').length;
    if (challenge.ownerId !== state.currentUserId) throw new Error('방장만 정원을 변경할 수 있어요.');
    if (capacity < challenge.capacity) throw new Error('정원은 줄일 수 없고 늘리기만 할 수 있어요.');
    if (capacity < activeCount) throw new Error('현재 참여자 수보다 정원을 줄일 수 없어요.');
    if (capacity > 10) throw new Error('정원은 최대 10명이에요.');
    challenge.capacity = capacity;
    await this.persist();
    return clone(challenge);
  }

  async joinChallenge(code: string, joinedAt = new Date().toISOString()): Promise<ChallengeMember> {
    const state = await this.requireState();
    const challenge = state.challenges.find((item) => item.inviteCode === code.trim().toUpperCase());
    if (!challenge) throw new Error('참여 코드를 확인해 주세요.');
    const timeline = createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate });
    const existing = state.members.find((member) => member.challengeId === challenge.id && member.userId === state.currentUserId);
    const activeCount = state.members.filter((member) => member.challengeId === challenge.id && member.status === 'ACTIVE').length;
    if (activeCount >= challenge.capacity) throw new Error('방 정원이 가득 찼어요.');

    const joinedDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(joinedAt)) as ChallengeMember['joinedDate'];
    const remainingEligibleDays = challenge.selectedDates.filter(
      (date) => date >= joinedDate && !challenge.holidayDates.includes(date),
    ).length;
    const decision = evaluateJoinPermission({
      now: joinedAt,
      timeline,
      activeMemberCount: activeCount,
      capacity: challenge.capacity,
      hasParticipatedBefore: Boolean(existing),
      remainingEffectiveDays: remainingEligibleDays,
    });
    if (!decision.allowed) throw new Error(joinErrorMessage(decision.reason));
    const member: ChallengeMember = {
      challengeId: challenge.id,
      userId: state.currentUserId,
      joinedAt,
      joinedDate,
      appliedLimit: calculateAppliedLimit({
        baseAmount: challenge.baseLimit,
        totalSelectedDays: challenge.selectedDates.length,
        remainingEffectiveDays: remainingEligibleDays,
      }),
      status: 'ACTIVE',
      isLateJoiner: joinedDate > challenge.startDate,
    };
    state.members.push(member);
    await this.persist();
    return clone(member);
  }

  async previewInvite(code: string): Promise<InvitePreview> {
    const state = await this.requireState();
    const normalized = code.trim().toUpperCase();
    const challenge = state.challenges.find((item) => item.inviteCode === normalized);
    if (!challenge) throw new Error('참여 코드를 확인해 주세요.');
    const now = new Date();
    const joinedDate = toSeoulLocalDate(now);
    const memberCount = state.members.filter(
      (member) => member.challengeId === challenge.id && member.status === 'ACTIVE',
    ).length;
    const remainingEffectiveDays = challenge.selectedDates.filter(
      (date) => date >= joinedDate && !challenge.holidayDates.includes(date),
    ).length;
    const existing = state.members.some(
      (member) => member.challengeId === challenge.id && member.userId === state.currentUserId,
    );
    const phase = getChallengePhase(
      createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate }),
      now,
    );
    return {
      code: normalized,
      challengeId: challenge.id,
      name: challenge.name,
      startDate: challenge.startDate,
      endDate: challenge.endDate,
      baseLimit: challenge.baseLimit,
      capacity: challenge.capacity,
      memberCount,
      totalSelectedDays: challenge.selectedDates.length,
      effectiveDayCount: challenge.selectedDates.length - challenge.holidayDates.length,
      holidayDates: [...challenge.holidayDates],
      joinedDate,
      remainingEffectiveDays,
      appliedLimit: remainingEffectiveDays > 0
        ? calculateAppliedLimit({
            baseAmount: challenge.baseLimit,
            totalSelectedDays: challenge.selectedDates.length,
            remainingEffectiveDays,
          })
        : 0,
      isLateJoiner: phase === 'ACTIVE',
      canJoin:
        !existing &&
        (phase === 'WAITING' || phase === 'ACTIVE') &&
        memberCount < challenge.capacity &&
        remainingEffectiveDays > 0,
    };
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
    if (patch.challengeId !== undefined && patch.challengeId !== expense.challengeId) {
      throw new Error('등록한 챌린지는 변경할 수 없어요.');
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
    this.assertExpenseMutationAllowed(state, expense.challengeId, 'DELETE', expense.userId);
    expense.deletedAt = new Date().toISOString();
    expense.updatedAt = expense.deletedAt;
    await this.persist();
  }

  async addComment(input: AddCommentInput): Promise<Comment> {
    const state = await this.requireState();
    const duplicate = state.comments.find((comment) => comment.clientRequestId === input.clientRequestId);
    if (duplicate) return clone(duplicate);
    const now = new Date().toISOString();
    const body = validateCommentBody(input.body);
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
    comment.body = validateCommentBody(body);
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
    this.refreshPhases(this.snapshot as AppSnapshot);
    return this.snapshot as AppSnapshot;
  }

  private refreshPhases(state: AppSnapshot): void {
    for (const challenge of state.challenges) {
      const phase = getChallengePhase(
        createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate }),
        Date.now(),
      );
      challenge.phase = phase;
      if (phase === 'ARCHIVED' && !challenge.archivedAt) challenge.archivedAt = new Date().toISOString();
    }
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
    if (!input.challengeId) return;
    const challenge = this.findChallenge(state, input.challengeId);
    const member = state.members.find(
      (item) => item.challengeId === challenge.id && item.userId === authorId,
    );
    if (!member) throw new Error('참여 중인 챌린지가 아니에요.');
    this.assertExpenseMutationAllowed(
      state,
      challenge.id,
      action,
      authorId,
    );
    if (!input.photoUri?.trim()) throw new Error('챌린지 지출에는 사진 1장이 필요해요.');
    const timeline = createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate });
    const eligibility = evaluateExpenseEligibility({
      expectedChallengeId: challenge.id,
      timeline,
      effectiveDates: challenge.selectedDates.filter((date) => !challenge.holidayDates.includes(date)),
      expense: {
        challengeId: challenge.id,
        amount: input.amount,
        category: input.category,
        occurredAt: input.occurredAt,
        joinedAt: member.joinedAt,
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
    challengeId: string | undefined,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    expenseAuthorId?: string,
  ): void {
    if (!challengeId) return;
    const challenge = this.findChallenge(state, challengeId);
    const member = state.members.find(
      (item) => item.challengeId === challengeId && item.userId === state.currentUserId,
    );
    const decision = evaluateExpenseMutationPermission({
      action,
      now: Date.now(),
      timeline: createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate }),
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
    if (!expense.challengeId) throw new Error('챌린지 지출에만 댓글을 남길 수 있어요.');
    const challenge = this.findChallenge(state, expense.challengeId);
    const member = state.members.find(
      (item) => item.challengeId === challenge.id && item.userId === state.currentUserId,
    );
    const decision = evaluateCommentMutationPermission({
      action,
      now,
      timeline: createChallengeTimeline({ startDate: challenge.startDate, endDate: challenge.endDate }),
      actorMemberStatus: member?.status ?? 'LEFT',
      actorId: state.currentUserId,
      commentAuthorId: comment?.userId,
      commentCreatedAt: comment?.createdAt,
    });
    if (!decision.allowed) throw new Error(commentPermissionMessage(decision.reason));
  }

  private findChallenge(state: AppSnapshot, challengeId: string): Challenge {
    const challenge = state.challenges.find((item) => item.id === challengeId);
    if (!challenge) throw new Error('챌린지를 찾을 수 없어요.');
    return challenge;
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

function validateCommentBody(value: string): string {
  const body = value.trim();
  if (!body || body.length > 500) throw new Error('댓글은 공백을 제외하고 1~500자로 입력해 주세요.');
  return body;
}

function joinErrorMessage(reason: string): string {
  if (reason === 'ROOM_FULL') return '방 정원이 가득 찼어요.';
  if (reason === 'ALREADY_PARTICIPATED') return '이미 참여했거나 참여했던 챌린지예요.';
  if (reason === 'NO_EFFECTIVE_DAYS') return '남은 유효 챌린지 날짜가 없어요.';
  return '참여 가능한 기간이 끝났어요.';
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
  return '완료된 챌린지의 댓글은 읽기 전용이에요.';
}

function expenseEligibilityMessage(reason: string | undefined): string {
  if (reason === 'BEFORE_JOIN') return '합류 전 지출은 챌린지에 등록할 수 없어요.';
  if (reason === 'HOLIDAY_OR_UNSELECTED_DATE') return '선택일이 아니거나 공휴일인 날짜의 지출은 포함할 수 없어요.';
  if (reason === 'OUTSIDE_CHALLENGE_TIME') return '챌린지 기간 안의 지출만 등록할 수 있어요.';
  if (reason === 'PHOTO_NOT_COMPLETE_BEFORE_C') return '보정 마감 전에 사진 저장이 완료돼야 해요.';
  return '챌린지 정책에 맞지 않는 지출이에요.';
}
