import type { PropsWithChildren } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { SectionHeader } from "@/components/ui/section-header";
import { palette, spacing } from "@/constants/design";

type FormSectionProps = PropsWithChildren<{
  title: string;
  hint?: string;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function FormSection({
  title,
  hint,
  required = false,
  style,
  children,
}: FormSectionProps) {
  return (
    <View style={[styles.section, style]}>
      <SectionHeader title={title} required={required} variant="form" />
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  hint: { color: palette.muted, fontSize: 11, lineHeight: 17 },
});
