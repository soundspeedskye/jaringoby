import { describe, expect, it } from 'vitest';

import type {
  AppSnapshot,
  Expense,
  ExpenseException,
  ExpenseExceptionResponse,
  Period,
  PeriodMember,
} from '@/shared/api/types';
import { buildAppIndexes } from '@/shared/model/app-indexes';

function period(): Period {
  return {
    id: 'period-1',
    roomId: 'room-1',
    weekIndex: 1,
    weekStart: '2026-08-03',
    weekEnd: '2026-08-07',
    selectedDayCount: 5,
    validDayCount: 5,
    holidayDates: [],
    holidayVersionId: 'v',
    phase: 'ACTIVE',
    isRestWeek: false,
    createdAt: '2026-08-03T00:00:00+09:00',
  };
}

function member(userId: string, status: PeriodMember['status'] = 'ACTIVE'): PeriodMember {
  return {
    periodId: 'period-1',
    userId,
    joinedAt: '2026-08-03T00:00:00+09:00',
    joinedDate: '2026-08-03',
    eligibleDayCount: 5,
    appliedLimit: 50_000,
    status,
    isLateJoiner: false,
  };
}

function expense(): Expense {
  return {
    id: 'expense-1',
    clientRequestId: 'req-1',
    periodId: 'period-1',
    userId: 'user-a',
    amount: 30_000,
    pointAmount: 0,
    category: '저녁',
    memo: '',
    occurredAt: '2026-08-05T03:00:00.000Z',
    createdAt: '2026-08-05T03:00:00.000Z',
    updatedAt: '2026-08-05T03:00:00.000Z',
    syncStatus: 'SYNCED',
  };
}

function exception(): ExpenseException {
  return {
    expenseId: 'expense-1',
    reason: '기념일',
    requestedBy: 'user-a',
    requestedAt: '2026-08-05T03:00:00.000Z',
  };
}

function response(
  userId: string,
  decision: ExpenseExceptionResponse['decision'] = 'APPROVED',
): ExpenseExceptionResponse {
  return { expenseId: 'expense-1', userId, decision, createdAt: '2026-08-05T04:00:00.000Z' };
}

function snapshotWith(input: {
  members: PeriodMember[];
  responses: ExpenseExceptionResponse[];
}): AppSnapshot {
  return {
    currentUserId: 'user-a',
    profiles: [
      { id: 'user-a', nickname: 'A', avatar: 'fox' },
      { id: 'user-b', nickname: 'B', avatar: 'rabbit' },
    ],
    rooms: [],
    roomMembers: [],
    periods: [period()],
    periodMembers: input.members,
    periodResults: [],
    memberStats: [],
    expenses: [expense()],
  comments: [],
  commentMentions: [],
  commentReactions: [],
  roomPosts: [],
  roomPostComments: [],
  roomPostReactions: [],
  roomPostPollOptions: [],
  roomPostPollVotes: [],
  notifications: [],
    expenseExceptions: [exception()],
    expenseExceptionResponses: input.responses,
    processedRequestIds: [],
  };
}

describe('settlementExcludedExpenseIds', () => {
  it('excludes only when every active member except the requester has approved', () => {
    const partial = buildAppIndexes(
      snapshotWith({
        members: [member('user-a'), member('user-b')],
        responses: [],
      }),
    );
    expect(partial.settlementExcludedExpenseIds.has('expense-1')).toBe(false);

    const unanimous = buildAppIndexes(
      snapshotWith({
        members: [member('user-a'), member('user-b')],
        responses: [response('user-b')],
      }),
    );
    expect(unanimous.settlementExcludedExpenseIds.has('expense-1')).toBe(true);
  });

  it('ignores approvals from members who have left the room', () => {
    // user-b left, so no other active member needs to approve.
    const indexes = buildAppIndexes(
      snapshotWith({
        members: [member('user-a'), member('user-b', 'LEFT')],
        responses: [],
      }),
    );
    expect(indexes.settlementExcludedExpenseIds.has('expense-1')).toBe(true);
  });

  it('keeps an exception in the budget while an eligible member has put it on hold', () => {
    const indexes = buildAppIndexes(
      snapshotWith({
        members: [member('user-a'), member('user-b')],
        responses: [response('user-b', 'HELD')],
      }),
    );
    expect(indexes.settlementExcludedExpenseIds.has('expense-1')).toBe(false);
    expect(indexes.heldUserIdsByExpenseId.get('expense-1')?.has('user-b')).toBe(true);
  });

  it('does not exclude when there are no active members', () => {
    const indexes = buildAppIndexes(
      snapshotWith({
        members: [member('user-a', 'LEFT')],
        responses: [],
      }),
    );
    expect(indexes.settlementExcludedExpenseIds.has('expense-1')).toBe(false);
  });
});

describe('room post indexes', () => {
  it('keeps visible posts newest-first and counts only visible comments', () => {
    const snapshot = snapshotWith({ members: [member('user-a')], responses: [] });
    snapshot.roomPosts = [
      {
        id: 'post-old', clientRequestId: 'post-old-request', roomId: 'room-1', kind: 'POST',
        authorId: 'user-a', body: '먼저 쓴 글', createdAt: '2026-08-03T01:00:00.000Z',
        updatedAt: '2026-08-03T01:00:00.000Z', version: 1,
      },
      {
        id: 'post-new', clientRequestId: 'post-new-request', roomId: 'room-1', kind: 'NOTICE',
        authorId: 'user-a', body: '최근 공지', createdAt: '2026-08-04T01:00:00.000Z',
        updatedAt: '2026-08-04T01:00:00.000Z', version: 1,
      },
      {
        id: 'post-deleted', clientRequestId: 'post-deleted-request', roomId: 'room-1', kind: 'POST',
        authorId: 'user-a', body: '지운 글', createdAt: '2026-08-05T01:00:00.000Z',
        updatedAt: '2026-08-05T01:00:00.000Z', deletedAt: '2026-08-05T02:00:00.000Z', version: 2,
      },
    ];
    snapshot.roomPostComments = [
      {
        id: 'comment-visible', clientRequestId: 'comment-visible-request', postId: 'post-new',
        authorId: 'user-a', body: '좋아요', createdAt: '2026-08-04T02:00:00.000Z',
        updatedAt: '2026-08-04T02:00:00.000Z', version: 1,
      },
      {
        id: 'comment-deleted', clientRequestId: 'comment-deleted-request', postId: 'post-new',
        authorId: 'user-a', body: '삭제', createdAt: '2026-08-04T03:00:00.000Z',
        updatedAt: '2026-08-04T03:00:00.000Z', deletedAt: '2026-08-04T04:00:00.000Z', version: 2,
      },
    ];

    const indexes = buildAppIndexes(snapshot);
    expect(indexes.postsByRoomId.get('room-1')?.map((post) => post.id))
      .toEqual(['post-new', 'post-old']);
    expect(indexes.commentCountByPostId.get('post-new')).toBe(1);
  });
});
