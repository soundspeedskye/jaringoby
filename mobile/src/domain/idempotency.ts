export interface IdempotencyEntry<Value> {
  readonly requestId: string;
  readonly value: Value;
}

export interface IdempotencyResolution<Value> {
  readonly value: Value;
  readonly replayed: boolean;
  readonly entries: readonly IdempotencyEntry<Value>[];
}

/**
 * Pure helper for offline retries. Persist entries under a server-side unique requestId index;
 * concurrent callers still require an atomic database transaction around this decision.
 */
export function resolveIdempotentRequest<Value>(
  entries: readonly IdempotencyEntry<Value>[],
  requestId: string,
  createValue: () => Value,
): IdempotencyResolution<Value> {
  if (!requestId.trim()) {
    throw new RangeError('requestId is required');
  }
  assertUniqueRequestIds(entries);

  const existing = entries.find((entry) => entry.requestId === requestId);
  if (existing) {
    return Object.freeze({ value: existing.value, replayed: true, entries });
  }

  const value = createValue();
  const nextEntries = Object.freeze([
    ...entries,
    Object.freeze({ requestId, value }),
  ]);
  return Object.freeze({ value, replayed: false, entries: nextEntries });
}

export function hasProcessedRequest(
  entries: readonly IdempotencyEntry<unknown>[],
  requestId: string,
): boolean {
  return entries.some((entry) => entry.requestId === requestId);
}

function assertUniqueRequestIds(entries: readonly IdempotencyEntry<unknown>[]): void {
  const requestIds = new Set<string>();
  for (const entry of entries) {
    if (!entry.requestId.trim()) {
      throw new RangeError('Every idempotency entry requires a requestId');
    }
    if (requestIds.has(entry.requestId)) {
      throw new RangeError(`Duplicate idempotency requestId: ${entry.requestId}`);
    }
    requestIds.add(entry.requestId);
  }
}
