import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, palette, radii, spacing } from '@/shared/config/design';

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

// "종이 가계부" 방향: 떠 있는 유리 알약을 걷어내고 화면 하단에 도킹된 종이 시트로 둔다.
// 상단 모서리만 둥글게 + 상단 괘선(palette.line) + 위로 뜨는 옅은 그림자, 세이프에어리어는 종이로 채운다.
// 선택 탭은 큰 배경 대신 라벨 아래 짧은 라인(라인식 위계)으로 표시한다.
export function SheetTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      testID="sheet-tab-bar">
      <View style={styles.row}>
        {state.routes.map((route, index) => {
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
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  row: { flexDirection: 'row', paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 56, position: 'relative' },
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
