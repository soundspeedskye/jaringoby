import { describe, expect, it, vi } from "vitest";

import { createClockSkewRetryFetch } from "@/shared/api/supabase/clock-skew-retry";

const SKEW_BODY = JSON.stringify({
  code: "PGRST303",
  details: null,
  hint: null,
  message: "JWT issued at future",
});

const skewResponse = () => new Response(SKEW_BODY, { status: 401 });
const okResponse = () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 });

function createFetch(responses: (() => Response)[]) {
  const calls: unknown[][] = [];
  const baseFetch = vi.fn(async (...args: unknown[]) => {
    calls.push(args);
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    return next();
  }) as unknown as typeof fetch;
  const waits: number[] = [];
  const retryFetch = createClockSkewRetryFetch(baseFetch, {
    delaysMs: [400, 1200],
    wait: async (ms) => {
      waits.push(ms);
    },
  });
  return { retryFetch, baseFetch, calls, waits };
}

describe("createClockSkewRetryFetch", () => {
  it("시계 편차로 거부되면 기다렸다 다시 보내고, 통과하면 그 응답을 돌려준다", async () => {
    const { retryFetch, calls, waits } = createFetch([skewResponse, okResponse]);

    const response = await retryFetch("https://example.test/rest/v1/rooms");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([400]);
  });

  it("편차가 계속되면 정해진 횟수까지만 재시도하고 마지막 응답을 돌려준다", async () => {
    const { retryFetch, calls, waits } = createFetch([skewResponse]);

    const response = await retryFetch("https://example.test/rest/v1/rooms");

    expect(response.status).toBe(401);
    // 최초 1회 + 재시도 2회
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([400, 1200]);
    await expect(response.text()).resolves.toContain("PGRST303");
  });

  it("성공한 응답은 그대로 통과시킨다", async () => {
    const { retryFetch, calls, waits } = createFetch([okResponse]);

    const response = await retryFetch("https://example.test/rest/v1/rooms");

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it("만료 같은 진짜 인증 실패는 재시도하지 않는다", async () => {
    const expired = () =>
      new Response(JSON.stringify({ code: "PGRST303", message: "JWT expired" }), {
        status: 401,
      });
    const { retryFetch, calls } = createFetch([expired]);

    const response = await retryFetch("https://example.test/rest/v1/rooms");

    expect(response.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("401이 아닌 실패는 재시도하지 않는다", async () => {
    const forbidden = () =>
      new Response(JSON.stringify({ code: "42501", message: "permission denied" }), {
        status: 403,
      });
    const { retryFetch, calls } = createFetch([forbidden]);

    const response = await retryFetch("https://example.test/rest/v1/rooms");

    expect(response.status).toBe(403);
    expect(calls).toHaveLength(1);
  });

  it("본문을 다시 읽을 수 없는 Request 입력은 재시도하지 않는다", async () => {
    const { retryFetch, calls } = createFetch([skewResponse, okResponse]);

    const response = await retryFetch(
      new Request("https://example.test/rest/v1/rooms", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it("재시도해도 원래 요청 인자를 그대로 다시 보낸다", async () => {
    const { retryFetch, calls } = createFetch([skewResponse, okResponse]);
    const init = { method: "POST", body: '{"a":1}' };

    await retryFetch("https://example.test/rest/v1/rooms", init);

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["https://example.test/rest/v1/rooms", init]);
    expect(calls[1]).toEqual(["https://example.test/rest/v1/rooms", init]);
  });
});
