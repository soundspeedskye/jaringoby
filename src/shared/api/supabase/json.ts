import type { JsonObject } from './rows';

/** RPC가 돌려주는 느슨한 JSON을 다루는 잎 모듈. 다른 supabase 모듈에
    의존하지 않는다 — errors와 mappers 양쪽이 쓰기 때문이다. */

export function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

export function isString(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function firstObject(value: unknown): JsonObject | null {
  if (Array.isArray(value)) return asObject(value[0]);
  return asObject(value);
}
