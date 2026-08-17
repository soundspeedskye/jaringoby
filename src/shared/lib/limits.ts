export function calculateAppliedLimit(input: {
  readonly baseAmount: number;
  readonly totalSelectedDays: number;
  readonly remainingEffectiveDays: number;
}): number {
  assertKrwAmount(input.baseAmount, 'baseAmount', true);
  if (!Number.isInteger(input.totalSelectedDays) || input.totalSelectedDays < 1) {
    throw new RangeError('totalSelectedDays must be a positive integer');
  }
  if (
    !Number.isInteger(input.remainingEffectiveDays) ||
    input.remainingEffectiveDays < 0 ||
    input.remainingEffectiveDays > input.totalSelectedDays
  ) {
    throw new RangeError('remainingEffectiveDays must be an integer between 0 and totalSelectedDays');
  }

  // BigInt keeps floor(B * R / N) exact even when B * R exceeds Number.MAX_SAFE_INTEGER.
  const amount =
    (BigInt(input.baseAmount) * BigInt(input.remainingEffectiveDays)) /
    BigInt(input.totalSelectedDays);
  const result = Number(amount);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Applied limit exceeds the safe KRW integer range');
  }
  return result;
}

export function calculateRemainingAmount(appliedLimit: number, eligibleSpending: number): number {
  assertKrwAmount(appliedLimit, 'appliedLimit', true);
  assertKrwAmount(eligibleSpending, 'eligibleSpending', true);
  const remaining = appliedLimit - eligibleSpending;
  if (!Number.isSafeInteger(remaining)) {
    throw new RangeError('Remaining amount exceeds the safe KRW integer range');
  }
  return remaining;
}

export function assertKrwAmount(value: number, name = 'amount', allowZero = false): void {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a ${allowZero ? 'non-negative' : 'positive'} safe KRW integer`);
  }
}
