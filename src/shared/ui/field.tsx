import type { ComponentProps } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { fonts, palette, radii, spacing } from '@/shared/config/design';

type FieldProps = ComponentProps<typeof TextInput> & {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Field({
  label,
  error,
  hint,
  style,
  containerStyle,
  ...props
}: FieldProps) {
  const accessibilityHint = error ?? props.accessibilityHint ?? hint;
  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label ?? props.accessibilityLabel}
        accessibilityHint={accessibilityHint}
        placeholderTextColor={palette.muted}
        style={[styles.input, error && styles.inputError, style]}
        {...props}
      />
      {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.sm },
  label: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: palette.ink,
    fontFamily: fonts.hand,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    fontSize: 16,
  },
  inputError: { borderColor: palette.danger },
  error: { color: palette.danger, fontFamily: fonts.hand, fontSize: 12 },
  hint: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
});
