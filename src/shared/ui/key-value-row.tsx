import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { fonts, palette, spacing, tabularNums } from "@/shared/config/design";

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
  label: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
  value: {
    flex: 1,
    color: palette.ink,
    fontFamily: fonts.number,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "right",
    ...tabularNums,
  },
  emphasized: { color: palette.green, fontWeight: "800" },
});
