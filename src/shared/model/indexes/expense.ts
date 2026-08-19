import type { Expense } from '@/shared/api/types';
import { isExpenseVisible } from '@/shared/api/expense-sync';
import type { AppIndexes } from './types';
import { appendIndexValue } from './util';

/**
 * 지출은 자기 주차에 속한다. 그래서 작성자만으로 묶는 인덱스는 두지 않는다:
 * 지출 목록은 언제나 하나의 주차로 스코프된 채 조회된다.
 */
export function buildExpenseIndexes(expenses: Expense[]): Pick<
  AppIndexes,
  'expenseById' | 'expensesByPeriodId' | 'expensesByPeriodAndUserId'
> {
  const expenseById = new Map<string, Expense>();
  const expensesByPeriodId = new Map<string, Expense[]>();
  const expensesByPeriodAndUserId = new Map<string, Map<string, Expense[]>>();

  expenses.forEach((expense) => {
    if (!isExpenseVisible(expense)) return;
    expenseById.set(expense.id, expense);
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
    expensesByPeriodAndUserId,
  };
}

export function pickExpenseIndexes(indexes: AppIndexes): Pick<
  AppIndexes,
  'expenseById' | 'expensesByPeriodId' | 'expensesByPeriodAndUserId'
> {
  return {
    expenseById: indexes.expenseById,
    expensesByPeriodId: indexes.expensesByPeriodId,
    expensesByPeriodAndUserId: indexes.expensesByPeriodAndUserId,
  };
}
