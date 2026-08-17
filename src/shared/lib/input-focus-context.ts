import { createContext, useContext } from 'react';
import type { FocusEvent } from 'react-native';

/**
 * 포커스된 입력을 키보드 위로 밀어 올리는 콜백을 아래로 전달한다.
 * 스크롤을 소유한 쪽(댓글 스레드 위젯)이 제공하고, 그 안에 렌더되는
 * 입력(지출 편집 폼 등)이 소비한다. 제공자와 소비자가 서로 다른 레이어라
 * 둘 다 참조할 수 있는 shared에 둔다.
 */
export const InputFocusContext = createContext<(event: FocusEvent) => void>(
  () => undefined,
);

export function useInputFocus(): (event: FocusEvent) => void {
  return useContext(InputFocusContext);
}
