import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { useSubmit } from "@/shared/lib/use-submit";
import { useSession } from "@/shared/providers/session-provider";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { Screen } from "@/shared/ui/screen";

type Mode = "SIGN_IN" | "SIGN_UP";

// 서버도 같은 주소로의 재발송을 60초 간격으로 막는다(config.toml max_frequency).
// 그보다 짧게 두면 사용자는 눌러놓고 실패 메시지만 보게 된다.
const RESET_COOLDOWN_MS = 60_000;

export function SignInPage() {
  const { accountSafetyNotice, requestPasswordReset, signIn, signUp } =
    useSession();
  const [mode, setMode] = useState<Mode>("SIGN_IN");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetReadyAt, setResetReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  // 로그인/가입과 재설정 메일은 각자 진행 표시를 가지지만 오류 자리는 하나다.
  // 새 시도를 시작할 때 상대 쪽 오류도 함께 지워 두 문구가 겹치지 않게 한다.
  const account = useSubmit("계정 요청을 처리하지 못했어요.");
  const reset = useSubmit("재설정 메일을 보내지 못했어요.");
  const error = account.error ?? reset.error;
  const submitting = account.submitting;
  const resetting = reset.submitting;

  // 남은 시간은 항상 Date.now()로 다시 계산한다. 카운터를 1씩 깎으면 앱이
  // 백그라운드에 있는 동안 타이머가 멈춰 실제보다 오래 잠긴다.
  const resetCooldown = Math.max(0, Math.ceil((resetReadyAt - now) / 1000));
  useEffect(() => {
    if (resetReadyAt <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [now, resetReadyAt]);

  const submitAccount = () =>
    account.submit(async () => {
      reset.setError(null);
      setMessage(null);
      if (mode === "SIGN_IN") {
        await signIn(email, password);
        return;
      }
      const result = await signUp(email, password, nickname);
      if (result === "CONFIRM_EMAIL") {
        setMessage(
          "인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.",
        );
      }
    });

  const resetPassword = () =>
    reset.submit(async () => {
      if (resetCooldown > 0) return;
      account.setError(null);
      setMessage(null);
      await requestPasswordReset(email);
      setMessage("비밀번호 재설정 링크를 이메일로 보냈어요.");
      // 보내지 못했을 때는 잠그지 않는다. 주소 오타처럼 사용자가 바로 고쳐
      // 다시 시도할 수 있는 실패가 대부분이다.
      setResetReadyAt(Date.now() + RESET_COOLDOWN_MS);
      setNow(Date.now());
    });

  const resetLocked = resetting || resetCooldown > 0;
  const resetLabel = resetting
    ? "재설정 메일 보내는 중…"
    : resetCooldown > 0
      ? `${resetCooldown}초 후 다시 보낼 수 있어요`
      : "비밀번호를 잊었나요?";

  return (
    <Screen testID="sign-in-screen">
      <View style={styles.brand}>
        <View style={styles.logo}>
          <MaterialCommunityIcons
            color={palette.yellow}
            name="shield-star-outline"
            size={35}
          />
        </View>
        <Text style={styles.kicker}> </Text>
        <Text style={styles.title}>ZARINGOVY</Text>
        {/* <Text style={styles.subtitle}>
          계정으로 기록을 안전하게 복구하고 여러 기기에서 이어 보세요.
        </Text> */}
      </View>

      <GlassSurface style={styles.card}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <ModeTab
            active={mode === "SIGN_IN"}
            label="로그인"
            onPress={() => setMode("SIGN_IN")}
          />
          <ModeTab
            active={mode === "SIGN_UP"}
            label="회원가입"
            onPress={() => setMode("SIGN_UP")}
          />
        </View>
        {mode === "SIGN_UP" ? (
          <Field
            autoComplete="nickname"
            label="닉네임"
            maxLength={20}
            onChangeText={setNickname}
            placeholder="2~20자"
            value={nickname}
          />
        ) : null}
        <Field
          autoCapitalize="none"
          autoComplete="email"
          inputMode="email"
          keyboardType="email-address"
          label="이메일"
          onChangeText={setEmail}
          placeholder="you@example.com"
          value={email}
        />
        <Field
          autoCapitalize="none"
          autoComplete={
            mode === "SIGN_IN" ? "current-password" : "new-password"
          }
          label="비밀번호"
          onChangeText={setPassword}
          placeholder="8자 이상"
          secureTextEntry
          value={password}
        />

        <FormMessage message={message} tone="success" />
        <FormMessage message={accountSafetyNotice} />
        <FormMessage message={error} />
        <PrimaryButton
          label={mode === "SIGN_IN" ? "로그인" : "계정 만들기"}
          loading={submitting}
          onPress={() => void submitAccount()}
        />
        {mode === "SIGN_IN" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: resetLocked }}
            disabled={resetLocked}
            onPress={() => void resetPassword()}
            style={styles.resetButton}
          >
            <Text style={[styles.resetText, resetLocked && styles.resetTextLocked]}>
              {resetLabel}
            </Text>
          </Pressable>
        ) : null}
      </GlassSurface>
    </Screen>
  );
}

function ModeTab({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: "center", paddingTop: 54, paddingBottom: spacing.xxl },
  logo: {
    width: 70,
    height: 70,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: palette.green,
  },
  kicker: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
    marginTop: spacing.lg,
  },
  title: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 5,
    textAlign: "center",
  },
  subtitle: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: palette.paper,
  },
  tabs: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: "rgba(52,49,40,0.06)",
  },
  tab: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  tabActive: { backgroundColor: palette.green },
  tabText: {
    color: palette.muted,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  tabTextActive: { color: palette.cream },
  resetButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  resetText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  resetTextLocked: {
    color: palette.muted,
  },
});
