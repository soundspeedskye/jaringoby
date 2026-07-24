import { describe, expect, it, vi } from 'vitest';

import { createDemoSnapshot } from '@/data/demo-seed';
import type { Comment, Expense } from '@/data/types';
import { createAppStore } from '@/store/app-store';

describe('createAppStore', () => {
  it('does not notify subscribers for an equivalent cloned snapshot', () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const snapshot = createDemoSnapshot();

    store.setSnapshot(snapshot);
    const firstState = store.getState();
    store.setSnapshot(clone(snapshot));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState()).toBe(firstState);
  });

  it('preserves unrelated slices when only comments change', () => {
    const store = createStore();
    const snapshot = createDemoSnapshot();
    store.setSnapshot(snapshot);
    const before = store.getState().snapshot;
    const beforeIndexes = store.getState().indexes;
    const beforeDerived = {
      activeRoom: store.getState().activeRoom,
      currentPeriod: store.getState().currentPeriod,
      currentUser: store.getState().currentUser,
      pastPeriods: store.getState().pastPeriods,
    };
    if (!before) throw new Error('snapshot missing');

    const incoming = clone(snapshot);
    incoming.comments.push(newComment(incoming.expenses[0]?.id ?? 'expense-1'));
    store.setSnapshot(incoming);
    const after = store.getState().snapshot;
    if (!after) throw new Error('snapshot missing');

    expect(after).not.toBe(before);
    expect(after.comments).not.toBe(before.comments);
    expect(after.rooms).toBe(before.rooms);
    expect(after.roomMembers).toBe(before.roomMembers);
    expect(after.periods).toBe(before.periods);
    expect(after.periodMembers).toBe(before.periodMembers);
    expect(after.expenses).toBe(before.expenses);
    expect(store.getState().indexes.commentsByExpenseId).not.toBe(
      beforeIndexes.commentsByExpenseId,
    );
    expect(store.getState().indexes.commentCountByExpenseId).not.toBe(
      beforeIndexes.commentCountByExpenseId,
    );
    expect(store.getState().indexes.roomById).toBe(beforeIndexes.roomById);
    expect(store.getState().indexes.periodById).toBe(beforeIndexes.periodById);
    expect(store.getState().indexes.profileById).toBe(beforeIndexes.profileById);
    expect(store.getState().indexes.membersByPeriodId).toBe(
      beforeIndexes.membersByPeriodId,
    );
    expect(store.getState().indexes.expenseById).toBe(beforeIndexes.expenseById);
    expect(store.getState().indexes.expensesByPeriodId).toBe(
      beforeIndexes.expensesByPeriodId,
    );
    expect(store.getState().indexes.resultsByPeriodId).toBe(
      beforeIndexes.resultsByPeriodId,
    );
    expect(store.getState().indexes.statsByRoomId).toBe(beforeIndexes.statsByRoomId);
    expect(store.getState().indexes.crownIdsByPeriodId).toBe(
      beforeIndexes.crownIdsByPeriodId,
    );
    expect(store.getState().activeRoom).toBe(beforeDerived.activeRoom);
    expect(store.getState().currentPeriod).toBe(beforeDerived.currentPeriod);
    expect(store.getState().currentUser).toBe(beforeDerived.currentUser);
    expect(store.getState().pastPeriods).toBe(beforeDerived.pastPeriods);
  });

  it('preserves existing entity references when a record is inserted at the front', () => {
    const store = createStore();
    const snapshot = createDemoSnapshot();
    store.setSnapshot(snapshot);
    const previousExpenses = store.getState().snapshot?.expenses;
    const existing = previousExpenses?.[0];
    if (!previousExpenses || !existing) throw new Error('demo expense missing');

    const incoming = clone(snapshot);
    incoming.expenses.unshift(newExpense(existing));
    store.setSnapshot(incoming);
    const nextExpenses = store.getState().snapshot?.expenses;

    expect(nextExpenses).not.toBe(previousExpenses);
    expect(nextExpenses?.[1]).toBe(existing);
  });

  it('rebuilds only expense-dependent indexes when an expense changes', () => {
    const store = createStore();
    const snapshot = createDemoSnapshot();
    store.setSnapshot(snapshot);
    const before = store.getState().indexes;
    const incoming = clone(snapshot);
    const expense = incoming.expenses[0];
    if (!expense) throw new Error('demo expense missing');
    expense.amount += 1;
    expense.updatedAt = '2026-07-23T00:00:00.000Z';

    store.setSnapshot(incoming);
    const after = store.getState().indexes;

    expect(after.expenseById).not.toBe(before.expenseById);
    expect(after.expensesByPeriodId).not.toBe(before.expensesByPeriodId);
    expect(after.expensesByUserId).not.toBe(before.expensesByUserId);
    expect(after.expensesByPeriodAndUserId).not.toBe(
      before.expensesByPeriodAndUserId,
    );
    expect(after.crownIdsByPeriodId).not.toBe(before.crownIdsByPeriodId);
    expect(after.roomById).toBe(before.roomById);
    expect(after.periodById).toBe(before.periodById);
    expect(after.profileById).toBe(before.profileById);
    expect(after.membersByPeriodId).toBe(before.membersByPeriodId);
    expect(after.commentsByExpenseId).toBe(before.commentsByExpenseId);
    expect(after.commentCountByExpenseId).toBe(before.commentCountByExpenseId);
    expect(after.resultsByPeriodId).toBe(before.resultsByPeriodId);
    expect(after.statsByRoomId).toBe(before.statsByRoomId);
  });
});

function createStore() {
  return createAppStore({
    dataMode: 'demo',
  });
}

function newComment(expenseId: string): Comment {
  return {
    id: 'comment-new',
    clientRequestId: 'comment-request-new',
    expenseId,
    userId: 'user-new',
    body: '새 댓글',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
    syncStatus: 'SYNCED',
  };
}

function newExpense(base: Expense): Expense {
  return {
    ...base,
    id: 'expense-new',
    clientRequestId: 'expense-request-new',
    createdAt: '2026-07-23T00:00:00.000Z',
    updatedAt: '2026-07-23T00:00:00.000Z',
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
