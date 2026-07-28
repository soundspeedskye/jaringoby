import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette, spacing } from "@/constants/design";

type HeaderSpacing = "md" | "lg" | "xl";

type PageHeaderProps = {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
  modal?: boolean;
  bottomSpacing?: HeaderSpacing;
  style?: StyleProp<ViewStyle>;
};

export function PageHeader({
  title,
  onBack,
  right,
  subtitle,
  modal = false,
  bottomSpacing = "lg",
  style,
}: PageHeaderProps) {
  return (
    <View
      style={[
        styles.container,
        modal && styles.modal,
        bottomSpacingStyles[bottomSpacing],
        style,
      ]}
    >
      {onBack ? (
        <Pressable
          accessibilityLabel="뒤로"
          accessibilityRole="button"
          hitSlop={4}
          onPress={onBack}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            color={palette.green}
            name="chevron-left"
            size={26}
          />
        </Pressable>
      ) : null}

      <View style={styles.copy}>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  modal: { paddingTop: spacing.xl },
  bottomMd: { marginBottom: spacing.md },
  bottomLg: { marginBottom: spacing.lg },
  bottomXl: { marginBottom: spacing.xl },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: palette.ink, fontSize: 28, fontWeight: "700", marginTop: 3 },
  subtitle: { color: palette.muted, fontSize: 11, marginTop: 3 },
});

const bottomSpacingStyles: Record<HeaderSpacing, ViewStyle> = {
  md: styles.bottomMd,
  lg: styles.bottomLg,
  xl: styles.bottomXl,
};
