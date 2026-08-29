import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { fonts, palette, radii, spacing } from '@/shared/config/design';

/**
 * 눌러서 닫는 오류 띠. 화면을 막지 않고 무슨 일이 있었는지만 알린다.
 * error가 없으면 아무것도 그리지 않으므로 호출부에서 조건을 감쌀 필요가 없다.
 */
export function ErrorBanner({
  error,
  onDismiss,
  style,
}: {
  error: string | null;
  onDismiss: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!error) return null;
  return (
    <Pressable
      accessibilityRole="alert"
      onPress={onDismiss}
      style={[styles.banner, style]}
    >
      <Text style={styles.text}>{error}</Text>
      <MaterialCommunityIcons color={palette.danger} name="close" size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: 'rgba(182,83,72,0.10)',
  },
  text: {
    color: palette.danger,
    flex: 1,
    fontFamily: fonts.hand,
    fontSize: 13,
  },
});
