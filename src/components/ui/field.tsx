import type { ComponentProps } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { palette, radii, spacing } from '@/constants/design';

type FieldProps = ComponentProps<typeof TextInput> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({ label, error, hint, style, ...props }: FieldProps) {
  const accessibilityHint = error ?? props.accessibilityHint ?? hint;
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
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
  label: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: palette.ink,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    fontSize: 16,
  },
  inputError: { borderColor: palette.danger },
  error: { color: palette.danger, fontSize: 12 },
  hint: { color: palette.muted, fontSize: 12 },
});
