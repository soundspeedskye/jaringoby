import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette, spacing } from "@/constants/design";

type EmptyStateVariant = "screen" | "preview" | "compact";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  variant = "screen",
  style,
}: EmptyStateProps) {
  const compact = variant === "compact";
  return (
    <View style={[styles.container, styles[variant], style]}>
      {icon ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={palette.greenSoft}
          importantForAccessibility="no"
          name={icon}
          size={compact ? 24 : 44}
        />
      ) : null}
      <Text
        accessibilityRole={compact ? undefined : "header"}
        style={[styles.title, compact && styles.compactTitle]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: spacing.sm },
  screen: { paddingTop: 100 },
  preview: { paddingVertical: 90 },
  compact: { paddingVertical: spacing.xxl },
  title: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  compactTitle: { color: palette.muted, fontSize: 12, fontWeight: "500" },
  description: {
    maxWidth: 360,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
  },
  action: { width: "100%", marginTop: spacing.sm },
});
