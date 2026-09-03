import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { fonts, palette, spacing } from "@/shared/config/design";
import { ErrorBanner } from "@/shared/ui/error-banner";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { Screen, ScreenFrame } from "@/shared/ui/screen";
import type { RoomHomeActions } from "@/widgets/room-home";
import { MemberExpenseList } from "@/widgets/room-home";
import { useRoomHome } from "../model/use-room-home";

export function RoomHomePage() {
  const { state, actions } = useRoomHome();

  if (state.status === "loading") {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.green} size="large" />
        </View>
      </Screen>
    );
  }

  if (state.status === "empty") {
    return <RoomHomeEmpty actions={actions} error={state.error} />;
  }

  return (
    <ScreenFrame testID="room-home-screen">
      <MemberExpenseList actions={actions} data={state.data} />
    </ScreenFrame>
  );
}

function RoomHomeEmpty({
  actions,
  error,
}: {
  actions: RoomHomeActions;
  error: string | null;
}) {
  return (
    <Screen>
      <ErrorBanner error={error} onDismiss={actions.clearError} />
      <View style={styles.emptyHeader}>
        <Text style={styles.kicker}>ZARINGOVY</Text>
        <Text style={styles.emptyTitle}>
          {error
            ? "기록을 불러오지 못했어요."
            : "티끌모아 티끌이어도\n땅 파서 티끌 안 나온다."}
        </Text>
        {error ? (
          <Text style={styles.emptyBody}>
            네트워크와 로그인 상태를 확인한 뒤 다시 시도해 주세요.
          </Text>
        ) : null}
      </View>
      <View style={styles.emptyActions}>
        {error ? (
          <PrimaryButton label="다시 시도" onPress={actions.retry} />
        ) : null}
        <PrimaryButton
          label="방 만들기"
          onPress={actions.createRoom}
          variant={error ? "secondary" : "primary"}
        />
        <PrimaryButton
          label="참여 코드 입력"
          onPress={actions.joinRoom}
          variant="secondary"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  kicker: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  emptyHeader: { paddingTop: 90, paddingBottom: spacing.xxl },
  emptyTitle: {
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 30,
    lineHeight: 42,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  emptyBody: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 15,
    lineHeight: 23,
    marginTop: spacing.md,
  },
  emptyActions: { gap: spacing.md },
});
