import type { Expense, Period } from '@/shared/api/types';
import { isExpenseVisible } from '@/shared/api/expense-sync';
import type { AppIndexes } from './types';
import { appendIndexValue } from './util';

export function buildExpenseIndexes(expenses: Expense[]): Pick<
  AppIndexes,
  'expenseById' | 'expensesByPeriodId' | 'expensesByUserId' | 'expensesByPeriodAndUserId'
> {
  const expenseById = new Map<string, Expense>();
  const expensesByPeriodId = new Map<string, Expense[]>();
  const expensesByUserId = new Map<string, Expense[]>();
  const expensesByPeriodAndUserId = new Map<string, Map<string, Expense[]>>();

  expenses.forEach((expense) => {
    if (!isExpenseVisible(expense)) return;
    expenseById.set(expense.id, expense);
    appendIndexValue(expensesByUserId, expense.userId, expense);
    if (!expense.periodId) return;
    appendIndexValue(expensesByPeriodId, expense.periodId, expense);
    let periodExpenses = expensesByPeriodAndUserId.get(expense.periodId);
    if (!periodExpenses) {
      periodExpenses = new Map<string, Expense[]>();
      expensesByPeriodAndUserId.set(expense.periodId, periodExpenses);
    }
    appendIndexValue(periodExpenses, expense.userId, expense);
  });

  return {
    expenseById,
    expensesByPeriodId,
    expensesByUserId,
    expensesByPeriodAndUserId,
  };
}

/**
 * 방별 피드 지출을 미리 계산한다. 셀렉터가 매 스토어 알림마다 전체 지출을
 * 훑는 대신 이 인덱스만 조회하도록. 피드는 삭제된 지출을 숨긴다(pending 삭제
 * 포함, isExpenseVisible보다 엄격). createdAt은 ISO(UTC)라 사전식=시간순.
 */
export function buildRoomFeedIndexes(
  expenses: Expense[],
  periods: Period[],
): Pick<AppIndexes, 'feedExpensesByRoomId' | 'feedExpensesByRoomAndUserId'> {
  const roomIdByPeriodId = new Map<string, string>();
  periods.forEach((period) => roomIdByPeriodId.set(period.id, period.roomId));
  const feedExpensesByRoomId = new Map<string, Expense[]>();
  const feedExpensesByRoomAndUserId = new Map<string, Map<string, Expense[]>>();
  expenses.forEach((expense) => {
    if (expense.deletedAt || !expense.periodId) return;
    const roomId = roomIdByPeriodId.get(expense.periodId);
    if (!roomId) return;
    appendIndexValue(feedExpensesByRoomId, roomId, expense);
    let expensesByUserId = feedExpensesByRoomAndUserId.get(roomId);
    if (!expensesByUserId) {
      expensesByUserId = new Map<string, Expense[]>();
      feedExpensesByRoomAndUserId.set(roomId, expensesByUserId);
    }
    appendIndexValue(expensesByUserId, expense.userId, expense);
  });
  feedExpensesByRoomId.forEach((roomExpenses) => {
    roomExpenses.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
  feedExpensesByRoomAndUserId.forEach((expensesByUserId) => {
    expensesByUserId.forEach((userExpenses) => {
      userExpenses.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  });
  return { feedExpensesByRoomId, feedExpensesByRoomAndUserId };
}

export function pickExpenseIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'expenseById' | 'expensesByPeriodId' | 'expensesByUserId' | 'expensesByPeriodAndUserId'
> {
  return {
    expenseById: indexes.expenseById,
    expensesByPeriodId: indexes.expensesByPeriodId,
    expensesByUserId: indexes.expensesByUserId,
    expensesByPeriodAndUserId: indexes.expensesByPeriodAndUserId,
  };
}
