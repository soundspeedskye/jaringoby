import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { tabBar } from '@/shared/config/design';
import { useLiquidGlass } from '@/shared/lib/use-liquid-glass';

// 탭 화면의 마지막 콘텐츠가 하단 탭바에 가리지 않도록 확보할 여백이다.
// 유리 경로는 떠 있는 캡슐, 종이 경로는 도킹된 시트라 화면을 가리는 높이가 서로 달라
// 상수 하나로 둘 수 없다. 탭이 없는 화면(모달·인증 등)은 이 값을 쓰지 않는다.
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  const liquidGlass = useLiquidGlass();
  const occupied = liquidGlass
    ? tabBar.capsuleHeight + Math.max(insets.bottom, tabBar.capsuleGap)
    : tabBar.sheetPaddingTop + tabBar.rowHeight + Math.max(insets.bottom, tabBar.sheetGap);
  return occupied + tabBar.contentGap;
}
