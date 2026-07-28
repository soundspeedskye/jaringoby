import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { palette, radii, shadow, spacing } from "@/constants/design";

type PlatformDateTimePickerProps = {
  iosModalTitle?: string;
  iosPresentation?: "inline" | "modal";
  maximumDate?: Date;
  minimumDate?: Date;
  mode: "date" | "time";
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

  const changed = (event: DateTimePickerEvent, date?: Date) => {
    setVisible(false);
    if (event.type === "set" && date) onChange(date);
  };

  const open = () => {
    if (Platform.OS === "android") {
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
      value={value}
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
            </View>
          </View>
        </Modal>
      ) : visible ? (
        picker
      ) : null}
    </>
  );
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
  inlinePicker: {
    width: "100%",
    height: 340,
  },
});
