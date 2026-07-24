import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NotificationDeliveryQueue,
  type NotificationDeliveryJob,
} from "@/services/notification-delivery-queue";

const JOB: NotificationDeliveryJob = {
  id: "comment:1",
  title: "새 댓글",
  body: "앱에서 확인해 주세요.",
  route: "/expense/1",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("NotificationDeliveryQueue", () => {
  it("deduplicates the same pending event", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deliver = vi.fn(() => blocked);
    const queue = new NotificationDeliveryQueue(deliver);

    queue.enqueue([JOB, JOB]);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    release?.();
    await blocked;
    queue.dispose();
  });

  it("retries a failed event and keeps delivery serialized", async () => {
    vi.useFakeTimers();
    const deliver = vi
      .fn<(job: NotificationDeliveryJob) => Promise<void>>()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue(undefined);
    const queue = new NotificationDeliveryQueue(deliver, [100]);

    queue.enqueue([JOB]);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(100);

    expect(deliver).toHaveBeenCalledTimes(2);
    queue.dispose();
  });

  it("retries an exhausted event when the app becomes active", async () => {
    const deliver = vi
      .fn<(job: NotificationDeliveryJob) => Promise<void>>()
      .mockRejectedValueOnce(new Error("permission"))
      .mockResolvedValue(undefined);
    const queue = new NotificationDeliveryQueue(deliver, []);

    queue.enqueue([JOB]);
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1));
    queue.retryPending();
    await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(2));
    queue.dispose();
  });
});
