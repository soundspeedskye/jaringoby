import { useCallback, useSyncExternalStore } from 'react';

/**
 * "지금 편집 중인 댓글", "지금 강조된 댓글"처럼 한 번에 한 줄만 가리키는 값이다.
 *
 * 이 값을 스레드의 useState로 두면 값이 바뀔 때마다 FlatList의 renderItem
 * identity가 함께 바뀌어, 실제로 달라지는 줄은 둘(빠지는 줄·들어오는 줄)뿐인데도
 * 화면에 보이는 셀이 전부 다시 그려진다. 그래서 스레드는 이 값을 구독하지 않고,
 * 각 줄이 자기 id에 해당하는 boolean만 구독한다.
 */
export class SelectedCommentStore {
  private readonly listeners = new Set<() => void>();

  constructor(private selectedId: string | null = null) {}

  get = (): string | null => this.selectedId;

  set = (next: string | null): void => {
    if (this.selectedId === next) return;
    this.selectedId = next;
    this.listeners.forEach((listener) => listener());
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** 이 댓글이 현재 선택된 줄인지. 선택이 옮겨 갈 때 두 줄만 다시 그려진다. */
export function useIsSelectedComment(
  store: SelectedCommentStore,
  commentId: string,
): boolean {
  const getSnapshot = useCallback(
    () => store.get() === commentId,
    [commentId, store],
  );
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
