import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { PropsWithChildren } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette, radii, spacing } from "@/constants/design";

type NoticeTone = "info" | "success" | "warning" | "danger";

const toneConfig: Record<
  NoticeTone,
  {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    color: string;
  }
> = {
  info: { icon: "information-outline", color: palette.green },
  success: { icon: "check-circle-outline", color: palette.success },
  warning: { icon: "alert-outline", color: palette.coralText },
  danger: { icon: "alert-circle-outline", color: palette.danger },
};

type NoticeBannerProps = PropsWithChildren<{
  tone?: NoticeTone;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}>;

export function NoticeBanner({
  tone = "info",
  icon,
  compact = false,
  style,
  children,
}: NoticeBannerProps) {
  const config = toneConfig[tone];
  const urgent = tone === "danger";
  return (
    <View
      accessible
      accessibilityLiveRegion={urgent ? "assertive" : undefined}
      accessibilityRole={urgent ? "alert" : "text"}
      style={[
        styles.container,
        styles[tone],
        compact && styles.compact,
        style,
      ]}
    >
      <MaterialCommunityIcons
        accessibilityElementsHidden
        color={config.color}
        importantForAccessibility="no"
        name={icon ?? config.icon}
        size={compact ? 17 : 19}
      />
      <Text style={[styles.text, { color: config.color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  compact: { padding: 0, backgroundColor: "transparent" },
  info: { backgroundColor: "rgba(47,113,93,0.10)" },
  success: { backgroundColor: "rgba(57,123,88,0.10)" },
  warning: { backgroundColor: "rgba(233,135,98,0.10)" },
  danger: { backgroundColor: "rgba(182,83,72,0.10)" },
  text: { flex: 1, fontSize: 11, lineHeight: 18 },
});
