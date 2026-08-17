import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { fonts, palette, radii, spacing } from "@/constants/design";
import { useSession } from "@/providers/session-provider";

type Mode = "SIGN_IN" | "SIGN_UP";

export default function SignInScreen() {
  const { accountSafetyNotice, requestPasswordReset, signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>("SIGN_IN");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      if (mode === "SIGN_IN") {
        await signIn(email, password);
      } else {
        const result = await signUp(email, password, nickname);
        if (result === "CONFIRM_EMAIL")
          setMessage(
            "인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.",
          );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "계정 요청을 처리하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setMessage(null);
    try {
      await requestPasswordReset(email);
      setMessage("비밀번호 재설정 링크를 이메일로 보냈어요.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "재설정 메일을 보내지 못했어요.",
      );
    }
  };

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
        <Text style={styles.title}>JARINGOBY</Text>
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
          onPress={() => void submit()}
        />
        {mode === "SIGN_IN" ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void resetPassword()}
            style={styles.resetButton}
          >
            <Text style={styles.resetText}>비밀번호를 잊었나요?</Text>
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
  tabText: { color: palette.muted, fontFamily: fonts.handBold, fontSize: 13, fontWeight: "700" },
  tabTextActive: { color: palette.cream },
  resetButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  resetText: { color: palette.green, fontFamily: fonts.handBold, fontSize: 12, fontWeight: "700" },
});
