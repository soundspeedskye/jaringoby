import { describe, expect, it } from 'vitest';

import { expenseOfficialAmount, expenseOptimisticAmount } from '@/data/expense-sync';
import type { Expense } from '@/data/types';

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    clientRequestId: 'request-1',
    periodId: 'period-1',
    userId: 'user-1',
    amount: 7_000,
    pointAmount: 3_000,
    category: '점심',
    memo: '',
    occurredAt: '2026-08-03T12:00:00+09:00',
    createdAt: '2026-08-03T12:00:00+09:00',
    updatedAt: '2026-08-03T12:00:00+09:00',
    syncStatus: 'SYNCED',
    version: 1,
    ...overrides,
  };
}

describe('expense budget amounts', () => {
  it('excludes point usage from official and optimistic budget totals', () => {
    const partialPointPayment = expense();

    expect(expenseOfficialAmount(partialPointPayment)).toBe(7_000);
    expect(expenseOptimisticAmount(partialPointPayment)).toBe(7_000);
  });

  it('allows a full point payment without consuming the challenge budget', () => {
    const fullPointPayment = expense({ amount: 0, pointAmount: 10_000 });

    expect(expenseOfficialAmount(fullPointPayment)).toBe(0);
    expect(expenseOptimisticAmount(fullPointPayment)).toBe(0);
  });
});
