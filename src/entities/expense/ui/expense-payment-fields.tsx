import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, palette, spacing } from "@/shared/config/design";
import { formatKrwInput } from "@/shared/lib/format";
import { Field } from "@/shared/ui/field";

type ExpensePaymentFieldsProps = {
  amountText: string;
  amountPlaceholder?: string;
  onAmountChange: (value: string) => void;
  onPointAmountChange: (value: string) => void;
  onUsesPointsChange: (usesPoints: boolean) => void;
  pointAmountText: string;
  pointAmountPlaceholder?: string;
  usesPoints: boolean;
};

/** 지출 생성·수정 화면에서 동일하게 쓰는 현금/포인트 결제 입력 묶음. */
export function ExpensePaymentFields({
  amountPlaceholder,
  amountText,
  onAmountChange,
  onPointAmountChange,
  onUsesPointsChange,
  pointAmountPlaceholder,
  pointAmountText,
  usesPoints,
}: ExpensePaymentFieldsProps) {
  return (
    <>
      <Field
        keyboardType="number-pad"
        label="결제 금액"
        onChangeText={(value) => onAmountChange(formatKrwInput(value))}
        placeholder={amountPlaceholder}
        value={amountText}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: usesPoints }}
        onPress={() => {
          const nextUsesPoints = !usesPoints;
          onUsesPointsChange(nextUsesPoints);
          if (!nextUsesPoints) onPointAmountChange("");
        }}
        style={styles.pointsToggle}
      >
        <View style={[styles.checkbox, usesPoints && styles.checkboxChecked]}>
          {usesPoints ? (
            <MaterialCommunityIcons
              color={palette.cream}
              name="check"
              size={15}
            />
          ) : null}
        </View>
        <View style={styles.pointsToggleCopy}>
          <Text style={styles.pointsToggleLabel}>포인트 결제</Text>
        </View>
      </Pressable>
      {usesPoints ? (
        <View style={styles.pointAmountField}>
          <Field
            keyboardType="number-pad"
            label="포인트 사용 금액"
            onChangeText={(value) => onPointAmountChange(formatKrwInput(value))}
            placeholder={pointAmountPlaceholder}
            value={pointAmountText}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  pointsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  pointAmountField: { marginTop: spacing.md },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.green,
    borderRadius: 6,
    backgroundColor: palette.paper,
  },
  checkboxChecked: { backgroundColor: palette.green },
  pointsToggleCopy: { flex: 1 },
  pointsToggleLabel: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
});
