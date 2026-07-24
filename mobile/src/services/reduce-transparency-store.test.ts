import { describe, expect, it, vi } from "vitest";

import {
  ReduceTransparencyStore,
  type ReduceTransparencyAdapter,
} from "@/services/reduce-transparency-store";

describe("ReduceTransparencyStore", () => {
  it("shares one native read and listener across subscribers", async () => {
    const fixture = createAdapter(false);
    const store = new ReduceTransparencyStore(fixture.adapter);
    const firstListener = vi.fn();
    const secondListener = vi.fn();

    const unsubscribeFirst = store.subscribe(firstListener);
    const unsubscribeSecond = store.subscribe(secondListener);
    await fixture.flush();

    expect(fixture.read).toHaveBeenCalledTimes(1);
    expect(fixture.listen).toHaveBeenCalledTimes(1);

    fixture.emit(true);

    expect(store.getSnapshot()).toBe(true);
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    expect(fixture.remove).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(fixture.remove).toHaveBeenCalledTimes(1);
  });

  it("does not let a late initial read overwrite a newer event", async () => {
    let resolveRead: ((value: boolean) => void) | undefined;
    const read = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const fixture = createAdapter(false, read);
    const store = new ReduceTransparencyStore(fixture.adapter);

    const unsubscribe = store.subscribe(vi.fn());
    fixture.emit(true);
    resolveRead?.(false);
    await fixture.flush();

    expect(store.getSnapshot()).toBe(true);
    unsubscribe();
  });

  it("does not call the iOS adapter on unsupported platforms", async () => {
    const fixture = createAdapter(true);
    const store = new ReduceTransparencyStore({
      ...fixture.adapter,
      supported: false,
    });

    const unsubscribe = store.subscribe(vi.fn());
    await fixture.flush();

    expect(store.getSnapshot()).toBe(false);
    expect(fixture.read).not.toHaveBeenCalled();
    expect(fixture.listen).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("starts a new shared listener after the last subscriber leaves", async () => {
    const fixture = createAdapter(false);
    const store = new ReduceTransparencyStore(fixture.adapter);

    store.subscribe(vi.fn())();
    const unsubscribe = store.subscribe(vi.fn());
    await fixture.flush();

    expect(fixture.read).toHaveBeenCalledTimes(2);
    expect(fixture.listen).toHaveBeenCalledTimes(2);
    expect(fixture.remove).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

function createAdapter(
  initial: boolean,
  readOverride?: () => Promise<boolean>,
): {
  adapter: ReduceTransparencyAdapter;
  emit: (enabled: boolean) => void;
  flush: () => Promise<void>;
  listen: ReturnType<typeof vi.fn>;
  read: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  let listener: ((enabled: boolean) => void) | undefined;
  const remove = vi.fn();
  const read = vi.fn(readOverride ?? (() => Promise.resolve(initial)));
  const listen = vi.fn((next: (enabled: boolean) => void) => {
    listener = next;
    return remove;
  });
  return {
    adapter: { supported: true, read, listen },
    emit: (enabled) => listener?.(enabled),
    flush: async () => {
      await Promise.resolve();
      await Promise.resolve();
    },
    listen,
    read,
    remove,
  };
}
