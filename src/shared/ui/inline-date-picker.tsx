import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { PlatformDateTimePicker } from "@/shared/ui/platform-date-time-picker";

export function InlineDatePicker({
  label,
  mode,
  value,
  onChange,
}: {
  label: string;
  mode: "date" | "time";
  value: Date;
  onChange: (value: Date) => void;
}) {
  return (
    <PlatformDateTimePicker
      mode={mode}
      onChange={onChange}
      renderTrigger={(open) => (
        <View>
          <Pressable onPress={open} style={styles.pickerButton}>
            <Text style={styles.pickerButtonText}>{label}</Text>
          </Pressable>
        </View>
      )}
      renderWeb={() => <Text style={styles.webPicker}>모바일에서 {label}</Text>}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  pickerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.green,
    borderRadius: radii.pill,
  },
  pickerButtonText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 11,
    fontWeight: "600",
  },
  webPicker: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10 },
});
