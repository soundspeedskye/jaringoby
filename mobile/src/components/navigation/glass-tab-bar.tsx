import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface } from '@/components/ui/glass-surface';
import { palette, radii, spacing } from '@/constants/design';

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

export function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, spacing.sm) }]}>
      <GlassSurface style={styles.glass} testID="glass-tab-bar">
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
                style={({ pressed }) => [styles.item, focused && styles.itemFocused, pressed && styles.pressed]}>
                <MaterialCommunityIcons color={focused ? palette.green : palette.muted} name={icons[route.name]} size={21} />
                <Text style={[styles.label, focused && styles.labelFocused]}>{labels[route.name]}</Text>
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  glass: { borderRadius: radii.lg },
  row: { flexDirection: 'row', padding: spacing.sm },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 54, borderRadius: radii.md },
  itemFocused: { backgroundColor: 'rgba(253,246,227,0.58)' },
  pressed: { opacity: 0.7 },
  label: { color: palette.muted, fontSize: 11 },
  labelFocused: { color: palette.green, fontWeight: '600' },
});
