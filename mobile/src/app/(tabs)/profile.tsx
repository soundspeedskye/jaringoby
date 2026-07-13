import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import { useAppActions, useAppData } from "@/providers/app-provider";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  requestNotificationPermission,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/services/notification-service";

export default function ProfileScreen() {
  const router = useRouter();
  const { archivedChallenges, currentUser } = useAppData();
  const { resetDemo } = useAppActions();
  const [notifications, setNotifications] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );

  useEffect(() => {
    void loadNotificationPreferences().then(setNotifications);
  }, []);

  const updateNotifications = async (
    key: keyof NotificationPreferences,
    value: boolean,
  ) => {
    if (value && !(await requestNotificationPermission())) {
      Alert.alert(
        "알림 권한이 필요해요",
        "기기 설정에서 자린고비 알림을 허용해 주세요.",
      );
      return;
    }
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    await saveNotificationPreferences(next);
  };

  return (
    <Screen testID="profile-screen">
      <Text style={styles.title}>내 정보</Text>

      <GlassSurface style={styles.profileCard}>
        <Text style={styles.avatar}>{currentUser?.avatar ?? "🙂"}</Text>
        <Text style={styles.name}>{currentUser?.nickname ?? "사용자"}</Text>
      </GlassSurface>

      <Text style={styles.sectionTitle}>기록</Text>
      <SettingRow
        icon="archive-outline"
        label="지난 챌린지"
        onPress={() => router.push("/history")}
        value={`${archivedChallenges.length}개`}
      />

      <Text style={styles.sectionTitle}>알림</Text>
      <ToggleRow
        icon="message-reply-text-outline"
        label="댓글·답글"
        onChange={(value) => void updateNotifications("socialEvents", value)}
        value={notifications.socialEvents}
      />
      <ToggleRow
        icon="bell-outline"
        label="시작·보정·정산"
        onChange={(value) => void updateNotifications("challengeEvents", value)}
        value={notifications.challengeEvents}
      />

      <Text style={styles.sectionTitle}>안전과 데이터</Text>
      <SettingRow
        icon="shield-check-outline"
        label="차단·신고 관리"
        onPress={() =>
          Alert.alert(
            "준비된 정책",
            "차단한 멤버의 금액은 유지하고 사진·댓글만 흐림 처리합니다.",
          )
        }
      />
      <SettingRow
        icon="file-document-outline"
        label="개인정보 및 보관 정책"
        onPress={() =>
          Alert.alert(
            "보관 정책",
            "완료 기록은 읽기 전용으로 보관하며 삭제 요청 시 콘텐츠를 비식별화합니다.",
          )
        }
      />

      <View style={styles.resetSection}>
        <PrimaryButton
          label="데모 데이터 초기화"
          onPress={() =>
            Alert.alert(
              "초기화할까요?",
              "앱의 로컬 데모 기록을 처음 상태로 되돌립니다.",
              [
                { text: "취소", style: "cancel" },
                {
                  text: "초기화",
                  style: "destructive",
                  onPress: () => void resetDemo(),
                },
              ],
            )
          }
          variant="secondary"
        />
      </View>
    </Screen>
  );
}

function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <MaterialCommunityIcons color={palette.green} name={icon} size={21} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <MaterialCommunityIcons
        color={palette.muted}
        name="chevron-right"
        size={20}
      />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons color={palette.green} name={icon} size={21} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={palette.cream}
        trackColor={{ false: palette.line, true: palette.green }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
  },
  avatar: { fontSize: 42 },
  name: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "700",
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowLabel: { flex: 1, color: palette.ink, fontSize: 14 },
  rowValue: { color: palette.muted, fontSize: 13 },
  resetSection: { marginTop: spacing.xxl },
});
