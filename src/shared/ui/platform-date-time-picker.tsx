import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, palette, radii, shadow, spacing } from "@/shared/config/design";

type PlatformDateTimePickerProps = {
  iosModalTitle?: string;
  iosPresentation?: "inline" | "modal";
  maximumDate?: Date;
  minimumDate?: Date;
  mode: "date" | "time" | "datetime";
  onChange: (value: Date) => void;
  renderTrigger: (open: () => void) => ReactNode;
  renderWeb: () => ReactNode;
  value: Date;
};

const TIME_ZONE = "Asia/Seoul";

export function PlatformDateTimePicker({
  iosModalTitle,
  iosPresentation = "inline",
  maximumDate,
  minimumDate,
  mode,
  onChange,
  renderTrigger,
  renderWeb,
  value,
}: PlatformDateTimePickerProps) {
  const [visible, setVisible] = useState(false);
  const [draftValue, setDraftValue] = useState(value);

  const changed = (event: DateTimePickerEvent, date?: Date) => {
    if (
      mode === "datetime" &&
      Platform.OS === "ios" &&
      iosPresentation === "modal" &&
      event.type === "set" &&
      date
    ) {
      setDraftValue(date);
      return;
    }
    setVisible(false);
    if (event.type === "set" && date) onChange(date);
  };

  const openAndroidTime = (selectedDate: Date) => {
    DateTimePickerAndroid.open({
      display: "default",
      is24Hour: true,
      mode: "time",
      onChange: (event, selectedTime) => {
        if (event.type === "set" && selectedTime) {
          onChange(mergeTime(selectedDate, selectedTime));
        }
      },
      timeZoneName: TIME_ZONE,
      value: selectedDate,
    });
  };

  const open = () => {
    if (Platform.OS === "android") {
      if (mode === "datetime") {
        DateTimePickerAndroid.open({
          display: "default",
          is24Hour: true,
          maximumDate,
          minimumDate,
          mode: "date",
          onChange: (event, selectedDate) => {
            if (event.type === "set" && selectedDate) {
              openAndroidTime(mergeDate(value, selectedDate));
            }
          },
          timeZoneName: TIME_ZONE,
          value,
        });
        return;
      }
      DateTimePickerAndroid.open({
        display: "default",
        is24Hour: true,
        maximumDate,
        minimumDate,
        mode,
        onChange: changed,
        timeZoneName: TIME_ZONE,
        value,
      });
      return;
    }
    setDraftValue(value);
    setVisible(true);
  };

  if (Platform.OS === "web") return renderWeb();

  const picker = (
    <DateTimePicker
      accentColor={iosPresentation === "modal" ? palette.green : undefined}
      display={iosPresentation === "modal" ? "inline" : "default"}
      is24Hour
      maximumDate={maximumDate}
      minimumDate={minimumDate}
      mode={mode}
      onChange={changed}
      style={iosPresentation === "modal" ? styles.inlinePicker : undefined}
      themeVariant={iosPresentation === "modal" ? "light" : undefined}
      timeZoneName={TIME_ZONE}
      value={mode === "datetime" && iosPresentation === "modal" ? draftValue : value}
    />
  );

  return (
    <>
      {renderTrigger(open)}
      {Platform.OS === "ios" && iosPresentation === "modal" ? (
        <Modal
          accessibilityViewIsModal
          animationType="fade"
          onRequestClose={() => setVisible(false)}
          transparent
          visible={visible}
        >
          <View style={styles.backdrop}>
            <Pressable
              accessibilityLabel="날짜 선택 닫기"
              onPress={() => setVisible(false)}
              style={styles.dismissArea}
            />
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{iosModalTitle}</Text>
                <Pressable
                  accessibilityLabel="닫기"
                  onPress={() => setVisible(false)}
                  style={styles.closeButton}
                >
                  <MaterialCommunityIcons color={palette.muted} name="close" size={21} />
                </Pressable>
              </View>
              {picker}
              {mode === "datetime" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    onChange(draftValue);
                    setVisible(false);
                  }}
                  style={styles.doneButton}
                >
                  <Text style={styles.doneButtonText}>완료</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Modal>
      ) : visible ? (
        picker
      ) : null}
    </>
  );
}

function mergeDate(value: Date, selectedDate: Date): Date {
  const next = new Date(value);
  next.setFullYear(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate(),
  );
  return next;
}

function mergeTime(value: Date, selectedTime: Date): Date {
  const next = new Date(value);
  next.setHours(
    selectedTime.getHours(),
    selectedTime.getMinutes(),
    selectedTime.getSeconds(),
    selectedTime.getMilliseconds(),
  );
  return next;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(52,49,40,0.28)",
  },
  dismissArea: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  modal: {
    width: "100%",
    maxWidth: 380,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: palette.paper,
    ...shadow,
  },
  modalHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: spacing.sm,
  },
  modalTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 15,
    fontWeight: "700",
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  doneButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: palette.green,
  },
  doneButtonText: { color: palette.cream, fontFamily: fonts.handBold, fontSize: 14, fontWeight: "700" },
  inlinePicker: {
    width: "100%",
    height: 340,
  },
});
