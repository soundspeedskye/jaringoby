import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

import { palette } from "@/constants/design";

type FormMessageProps = {
  message?: string | null;
  tone?: "error" | "success";
  style?: StyleProp<TextStyle>;
};

export function FormMessage({
  message,
  tone = "error",
  style,
}: FormMessageProps) {
  if (!message) return null;
  return (
    <Text
      accessibilityLiveRegion={tone === "success" ? "polite" : "assertive"}
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[
        styles.message,
        tone === "error" ? styles.error : styles.success,
        style,
      ]}
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  message: { fontSize: 12, lineHeight: 18 },
  error: { color: palette.danger },
  success: { color: palette.success },
});
