import { type PropsWithChildren } from 'react';
import {
  StyleSheet,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { palette, radii, shadow } from '@/constants/design';

// "종이 가계부" 방향: 반투명 유리(blur/liquid glass)를 걷어내고 불투명한 속지 표면으로 바꾼다.
// 경계는 테두리(palette.line)로 만들고 그림자는 최소로만 얹는다.
// 이름/props는 그대로 유지해 기존 호출부(history·profile·sign-in 등)를 건드리지 않는다.
// interactive는 과거 liquid-glass 전용 플래그라 시각적으로는 무시한다(호환용).
type GlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
}>;

export function GlassSurface({
  children,
  style,
  testID,
  accessible,
  accessibilityLabel,
  accessibilityRole,
}: GlassSurfaceProps) {
  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[styles.base, style]}
      testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.lg,
    ...shadow,
  },
});
