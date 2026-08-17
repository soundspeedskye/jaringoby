import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AddExpenseInput, Expense } from "@/shared/api/types";
import { useInputFocus } from "@/shared/lib/input-focus-context";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { formatFullDate } from "@/shared/lib/format";
import type { ExpenseCategory } from "@/shared/model/types";
import { EXPENSE_CATEGORIES } from "@/shared/model/types";
import {
  pickSanitizedExpensePhoto,
} from "@/shared/services/expense-photo-picker";
import { ChoiceChip } from "@/shared/ui/choice-chip";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { InlineDatePicker } from "@/shared/ui/inline-date-picker";
import { PrimaryButton } from "@/shared/ui/primary-button";

export function ExpenseEditor({
  expense,
  onClose,
  updateExpense,
}: {
  expense: Expense;
  onClose: () => void;
  updateExpense: (
    expenseId: string,
    patch: Partial<AddExpenseInput>,
  ) => Promise<Expense>;
}) {
  // 편집 폼은 댓글 스레드 스크롤 안에 렌더된다. 메모처럼 아래쪽에 있는
  // 입력에 포커스가 가면 키보드에 가리므로 스레드 쪽에 스크롤을 요청한다.
  const onInputFocus = useInputFocus();
  const [draftAmount, setDraftAmount] = useState(() =>
    formatKrwInput(String(expense.amount)),
  );
  const [usesPoints, setUsesPoints] = useState(expense.pointAmount > 0);
  const [draftPointAmount, setDraftPointAmount] = useState(() =>
    expense.pointAmount ? formatKrwInput(String(expense.pointAmount)) : "",
  );
  const [draftCategory, setDraftCategory] = useState<ExpenseCategory>(
    expense.category,
  );
  const [draftMemo, setDraftMemo] = useState(expense.memo);
  const [draftPhoto, setDraftPhoto] = useState(expense.photoUri ?? "");
  const [draftOccurredAt, setDraftOccurredAt] = useState(
    () => new Date(expense.occurredAt),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replacePhoto = async () => {
    try {
      const result = await pickSanitizedExpensePhoto("library");
      if (result.status === "selected") {
        setDraftPhoto(result.uri);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "사진을 교체하지 못했어요.",
      );
    }
  };

  const save = async () => {
    const amountText = draftAmount.replace(/[^0-9]/gu, "");
    const amount = Number(amountText);
    if (!amountText || !Number.isSafeInteger(amount) || amount < 0) {
      setError("금액을 0원 이상의 정수로 입력해 주세요.");
      return;
    }
    const pointAmountText = draftPointAmount.replace(/[^0-9]/gu, "");
    const pointAmount = usesPoints ? Number(pointAmountText) : 0;
    if (
      usesPoints &&
      (!pointAmountText ||
        !Number.isSafeInteger(pointAmount) ||
        pointAmount < 1)
    ) {
      setError("포인트 사용 금액을 1원 이상의 정수로 입력해 주세요.");
      return;
    }
    if (!draftPhoto) {
      setError("챌린지 지출에는 사진이 정확히 1장 필요해요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateExpense(expense.id, {
        amount,
        pointAmount,
        category: draftCategory,
        memo: draftMemo.trim(),
        photoUri: draftPhoto,
        occurredAt: draftOccurredAt.toISOString(),
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "지출을 수정하지 못했어요.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassSurface style={styles.editorCard} testID="expense-inline-editor">
      <View style={styles.editorHeader}>
        <Text style={styles.editorTitle}>지출 수정</Text>
        <Pressable accessibilityLabel="수정 취소" onPress={onClose}>
          <MaterialCommunityIcons
            color={palette.muted}
            name="close"
            size={21}
          />
        </Pressable>
      </View>
      <Field
        keyboardType="number-pad"
        label="결제 금액"
        onChangeText={(value) => setDraftAmount(formatKrwInput(value))}
        value={draftAmount}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: usesPoints }}
        onPress={() => {
          setUsesPoints((value) => !value);
          if (usesPoints) setDraftPointAmount("");
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
            onChangeText={(value) => setDraftPointAmount(formatKrwInput(value))}
            value={draftPointAmount}
          />
        </View>
      ) : null}
      <View
        accessibilityLabel="지출 카테고리 선택"
        accessibilityRole="radiogroup"
        style={styles.editCategories}
      >
        {EXPENSE_CATEGORIES.map((item) => (
          <ChoiceChip
            key={item}
            label={item}
            onPress={() => setDraftCategory(item)}
            selected={item === draftCategory}
          />
        ))}
      </View>
      <Field
        label="메모"
        maxLength={200}
        multiline
        onChangeText={setDraftMemo}
        onFocus={onInputFocus}
        style={styles.editMemo}
        value={draftMemo}
      />
      <Image
        accessibilityLabel="수정할 지출 사진"
        contentFit="contain"
        source={{ uri: draftPhoto }}
        style={styles.editPhoto}
      />
      <PrimaryButton
        label="사진 교체"
        onPress={() => void replacePhoto()}
        variant="secondary"
      />
      <Text style={styles.editDate}>{formatFullDate(draftOccurredAt)}</Text>
      <View style={styles.pickerRow}>
        <InlineDatePicker
          label="날짜 변경"
          mode="date"
          onChange={setDraftOccurredAt}
          value={draftOccurredAt}
        />
        <InlineDatePicker
          label="시간 변경"
          mode="time"
          onChange={setDraftOccurredAt}
          value={draftOccurredAt}
        />
      </View>
      <FormMessage message={error} style={styles.threadError} />
      <PrimaryButton
        label="수정 내용 저장"
        loading={saving}
        onPress={() => void save()}
      />
    </GlassSurface>
  );
}

function formatKrwInput(value: string): string {
  const digits = value.replace(/[^0-9]/gu, "");
  if (!digits) return "";

  const normalized = digits.replace(/^0+(?=\d)/u, "");
  return normalized.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

const styles = StyleSheet.create({
  editorCard: {
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: palette.paper,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 17,
    fontWeight: "700",
  },
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
  editCategories: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  editMemo: { minHeight: 76, textAlignVertical: "top" },
  editPhoto: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: radii.md,
    backgroundColor: palette.line,
  },
  editDate: {
    color: palette.ink,
    fontFamily: fonts.number,
    fontSize: 13,
    fontWeight: "600",
    ...tabularNums,
  },
  pickerRow: { flexDirection: "row", gap: spacing.sm },
  threadError: {
    color: palette.danger,
    fontFamily: fonts.hand,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
