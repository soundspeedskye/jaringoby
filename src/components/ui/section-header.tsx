import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette, spacing } from "@/constants/design";

type SectionHeaderProps = {
  title: string;
  meta?: string;
  right?: ReactNode;
  required?: boolean;
  variant?: "section" | "form";
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({
  title,
  meta,
  right,
  required = false,
  variant = "section",
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text
        accessibilityRole="header"
        style={[styles.title, variant === "form" && styles.formTitle]}
      >
        {title}
        {required ? <Text style={styles.required}> 필수</Text> : null}
      </Text>
      {meta || right ? (
        <View style={styles.trailing}>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
          {right}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    flexShrink: 1,
    color: palette.ink,
    fontSize: 19,
    fontWeight: "800",
  },
  formTitle: { fontSize: 15, fontWeight: "700" },
  required: { color: palette.coralText, fontSize: 11 },
  trailing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meta: { color: palette.muted, fontSize: 11 },
});
