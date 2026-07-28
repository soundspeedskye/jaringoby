import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette, spacing } from "@/constants/design";

type KeyValueRowProps = {
  label: string;
  value: string;
  emphasized?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function KeyValueRow({
  label,
  value,
  emphasized = false,
  style,
}: KeyValueRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="text"
      style={[styles.row, style]}
    >
      <Text style={styles.label}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.value, emphasized && styles.emphasized]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  label: { color: palette.muted, fontSize: 12 },
  value: {
    flex: 1,
    color: palette.ink,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
  },
  emphasized: { color: palette.green, fontWeight: "800" },
});
