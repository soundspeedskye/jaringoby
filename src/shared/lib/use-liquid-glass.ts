import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';

import { useReduceTransparency } from '@/shared/lib/use-reduce-transparency';

// 리퀴드 글래스를 실제로 그려도 되는지 판별한다. 세 관문을 모두 통과해야 참이다.
//  1) isLiquidGlassAvailable  — iOS 26 SDK로 빌드돼 유리 컴포넌트가 앱에 들어있는가.
//  2) isGlassEffectAPIAvailable — 이 기기 런타임에 API가 실제로 있는가.
//     (일부 iOS 26 베타는 1)을 통과하고도 API가 없어 크래시한다. expo#40911)
//  3) 사용자가 "투명도 줄이기"를 켜지 않았는가.
// iOS가 아니면 두 판별 함수 모두 false를 돌려주므로 별도 Platform 분기가 필요 없다.
export function useLiquidGlass(): boolean {
  const reduceTransparency = useReduceTransparency();
  if (reduceTransparency) return false;
  return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}
