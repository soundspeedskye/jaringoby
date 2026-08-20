import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { GlassView } from 'expo-glass-effect';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, glass, palette, radii, spacing, tabBar } from '@/shared/config/design';
import { useLiquidGlass } from '@/shared/lib/use-liquid-glass';

const labels: Record<string, string> = {
  index: '챌린지',
  expenses: '내 지출',
  profile: '내 정보',
};

const icons: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  index: 'home-outline',
  expenses: 'format-list-bulleted',
  profile: 'account-circle-outline',
};

// 표면은 두 경로다. 아이템·라벨·인디케이터·네비게이션 로직은 양쪽이 똑같이 쓴다.
//
// 유리(iOS 26 · 접근성 OFF): 하단에서 띄운 리퀴드 글래스 캡슐.
//   콘텐츠가 바 아래와 양옆으로 흘러야 굴절이 보이므로 좌우에 여백을 둔다.
//   유리 위에 종이 테두리·그림자를 얹으면 탁해지므로 이 경로에는 둘 다 없다.
// 종이(그 외 전부): 화면 하단에 도킹된 종이 시트.
//   상단 모서리만 둥글게 + 상단 괘선(palette.line) + 위로 뜨는 옅은 그림자.
//   세이프에어리어까지 종이로 채운다.
//
// 선택 탭은 두 경로 모두 라벨 아래 짧은 라인으로 표시한다(라인식 위계).
export function SheetTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const liquidGlass = useLiquidGlass();

  const items = state.routes.map((route, index) => {
    const focused = state.index === index;
    const options = descriptors[route.key]?.options;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={options?.tabBarAccessibilityLabel ?? labels[route.name]}
        key={route.key}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
        <MaterialCommunityIcons color={focused ? palette.green : palette.muted} name={icons[route.name]} size={21} />
        <Text style={[styles.label, focused && styles.labelFocused]}>{labels[route.name]}</Text>
        {focused ? <View style={styles.indicator} /> : null}
      </Pressable>
    );
  });

  if (liquidGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        style={[styles.capsule, { bottom: Math.max(insets.bottom, tabBar.capsuleGap) }]}
        testID="sheet-tab-bar"
        tintColor={glass.tint}>
        <View style={styles.capsuleRow}>{items}</View>
      </GlassView>
    );
  }

  return (
    <View
      style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, tabBar.sheetGap) }]}
      testID="sheet-tab-bar">
      <View style={styles.sheetRow}>{items}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    left: tabBar.capsuleInsetX,
    right: tabBar.capsuleInsetX,
    maxWidth: tabBar.maxWidth,
    alignSelf: 'center',
    borderRadius: tabBar.capsuleHeight / 2,
  },
  capsuleRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
    paddingVertical: tabBar.capsulePaddingY,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: palette.paper,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    shadowColor: palette.ink,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  sheetRow: { flexDirection: 'row', paddingHorizontal: spacing.sm, paddingTop: tabBar.sheetPaddingTop },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: tabBar.rowHeight,
    position: 'relative',
  },
  pressed: { opacity: 0.7 },
  label: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11 },
  labelFocused: { color: palette.green, fontFamily: fonts.handBold, fontWeight: '600' },
  indicator: {
    position: 'absolute',
    bottom: 2,
    width: 18,
    height: 2,
    borderRadius: radii.pill,
    backgroundColor: palette.green,
  },
});
