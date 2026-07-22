import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { palette, radii, spacing } from "@/constants/design";

type ChipBaseProps = {
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

type ChoiceChipProps = ChipBaseProps & { selected: boolean };

export function ChoiceChip({
  label,
  icon,
  selected,
  onPress,
  style,
}: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={selected ? palette.cream : palette.green}
          importantForAccessibility="no"
          name={icon}
          size={18}
        />
      ) : null}
      <Text style={[styles.label, selected && styles.selectedLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ActionChip({ label, icon, onPress, style }: ChipBaseProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        styles.action,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons
          accessibilityElementsHidden
          color={palette.green}
          importantForAccessibility="no"
          name={icon}
          size={18}
        />
      ) : null}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.44)",
  },
  action: {
    borderColor: palette.green,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  selected: { borderColor: palette.green, backgroundColor: palette.green },
  label: { color: palette.green, fontSize: 12, fontWeight: "600" },
  selectedLabel: { color: palette.cream },
  pressed: { opacity: 0.7 },
});
