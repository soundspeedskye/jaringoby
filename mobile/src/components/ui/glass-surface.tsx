import { type PropsWithChildren } from 'react';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import {
  Platform,
  StyleSheet,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { palette, radii, shadow } from '@/constants/design';
import { useReduceTransparency } from '@/hooks/use-reduce-transparency';

type GlassSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  testID?: string;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
}>;

const webBackdropStyle = {
  backdropFilter: 'blur(24px) saturate(150%)',
  WebkitBackdropFilter: 'blur(24px) saturate(150%)',
} as unknown as ViewStyle;

const liquidGlassAvailable =
  Platform.OS === 'ios' &&
  isLiquidGlassAvailable() &&
  isGlassEffectAPIAvailable();

export function GlassSurface({
  children,
  style,
  interactive = false,
  testID,
  accessible,
  accessibilityLabel,
  accessibilityRole,
}: GlassSurfaceProps) {
  const reduceTransparency = useReduceTransparency();
  const surfaceStyle = [styles.base, style];
  const accessibilityProps = { accessible, accessibilityLabel, accessibilityRole, testID };
  const content = (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.tintLayer}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.edgeHighlight}
      />
      {children}
    </>
  );

  if (reduceTransparency) {
    return (
      <View {...accessibilityProps} style={[surfaceStyle, styles.opaqueFallback]}>
        {content}
      </View>
    );
  }

  if (liquidGlassAvailable) {
    return (
      <GlassView
        {...accessibilityProps}
        colorScheme="light"
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={surfaceStyle}
        tintColor="rgba(255,253,247,0.28)">
        {content}
      </GlassView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View {...accessibilityProps} style={[surfaceStyle, styles.webGlass, webBackdropStyle]}>
        {content}
      </View>
    );
  }

  // Android deliberately uses a composited translucent surface. It stays smooth in long
  // scrolling lists and avoids the native blur target/capture cost on lower-end devices.
  if (Platform.OS === 'android') {
    return (
      <View {...accessibilityProps} style={[surfaceStyle, styles.androidGlass]}>
        {content}
      </View>
    );
  }

  return (
    <BlurView
      {...accessibilityProps}
      intensity={48}
      style={[surfaceStyle, styles.fallbackGlass]}
      tint="systemMaterialLight">
      {content}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
    borderRadius: radii.xl,
    ...shadow,
  },
  tintLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(255,253,247,0.14)',
  },
  edgeHighlight: {
    position: 'absolute',
    top: 1,
    left: 22,
    right: 22,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.74)',
  },
  fallbackGlass: {
    backgroundColor: 'rgba(255,253,247,0.54)',
  },
  androidGlass: {
    backgroundColor: 'rgba(255,253,247,0.92)',
  },
  webGlass: {
    backgroundColor: 'rgba(255,253,247,0.76)',
    shadowColor: palette.ink,
  },
  opaqueFallback: {
    backgroundColor: palette.paper,
  },
});
