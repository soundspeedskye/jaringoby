import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/ui/field';
import { GlassSurface } from '@/components/ui/glass-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { palette, radii, spacing } from '@/constants/design';
import { useSession } from '@/providers/session-provider';

type Mode = 'SIGN_IN' | 'SIGN_UP';

export default function SignInScreen() {
  const { requestPasswordReset, signIn, signUp } = useSession();
  const [mode, setMode] = useState<Mode>('SIGN_IN');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    if (mode === 'SIGN_UP' && !accepted) {
      setError('서비스 이용 및 사진·지출 공유 범위를 확인해 주세요.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'SIGN_IN') {
        await signIn(email, password);
      } else {
        const result = await signUp(email, password, nickname);
        if (result === 'CONFIRM_EMAIL') setMessage('인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '계정 요청을 처리하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    setMessage(null);
    try {
      await requestPasswordReset(email);
      setMessage('비밀번호 재설정 링크를 이메일로 보냈어요.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '재설정 메일을 보내지 못했어요.');
    }
  };

  return (
    <Screen testID="sign-in-screen">
      <View style={styles.brand}>
        <View style={styles.logo}><MaterialCommunityIcons color={palette.yellow} name="shield-star-outline" size={35} /></View>
        <Text style={styles.kicker}>JARINGOBY</Text>
        <Text style={styles.title}>같이 지키는 지출 챌린지</Text>
        <Text style={styles.subtitle}>계정으로 기록을 안전하게 복구하고 여러 기기에서 이어 보세요.</Text>
      </View>

      <GlassSurface style={styles.card}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          <ModeTab active={mode === 'SIGN_IN'} label="로그인" onPress={() => setMode('SIGN_IN')} />
          <ModeTab active={mode === 'SIGN_UP'} label="회원가입" onPress={() => setMode('SIGN_UP')} />
        </View>
        {mode === 'SIGN_UP' ? (
          <Field autoComplete="nickname" label="닉네임" maxLength={20} onChangeText={setNickname} placeholder="2~20자" value={nickname} />
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
          autoComplete={mode === 'SIGN_IN' ? 'current-password' : 'new-password'}
          label="비밀번호"
          onChangeText={setPassword}
          placeholder="8자 이상"
          secureTextEntry
          value={password}
        />

        {mode === 'SIGN_UP' ? (
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted((value) => !value)} style={styles.consent}>
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted ? <MaterialCommunityIcons color={palette.cream} name="check" size={14} /> : null}
            </View>
            <Text style={styles.consentText}>이용약관·개인정보 처리와 챌린지 방에서 사진·금액·메모·댓글이 멤버에게 공유되는 범위를 확인했어요.</Text>
          </Pressable>
        ) : null}

        {message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <PrimaryButton label={mode === 'SIGN_IN' ? '로그인' : '계정 만들기'} loading={submitting} onPress={() => void submit()} />
        {mode === 'SIGN_IN' ? (
          <Pressable accessibilityRole="button" onPress={() => void resetPassword()} style={styles.resetButton}>
            <Text style={styles.resetText}>비밀번호를 잊었나요?</Text>
          </Pressable>
        ) : null}
      </GlassSurface>
    </Screen>
  );
}

function ModeTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', paddingTop: 54, paddingBottom: spacing.xxl },
  logo: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: palette.green },
  kicker: { color: palette.green, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginTop: spacing.lg },
  title: { color: palette.ink, fontSize: 25, fontWeight: '800', marginTop: 5, textAlign: 'center' },
  subtitle: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: spacing.sm, maxWidth: 300 },
  card: { gap: spacing.lg, padding: spacing.xl, backgroundColor: 'rgba(255,253,247,0.68)' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radii.md, backgroundColor: 'rgba(52,49,40,0.06)' },
  tab: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  tabActive: { backgroundColor: palette.green },
  tabText: { color: palette.muted, fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: palette.cream },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.green, borderRadius: 7 },
  checkboxChecked: { backgroundColor: palette.green },
  consentText: { flex: 1, color: palette.ink, fontSize: 11, lineHeight: 17 },
  message: { color: palette.success, fontSize: 12, lineHeight: 18 },
  error: { color: palette.danger, fontSize: 12, lineHeight: 18 },
  resetButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  resetText: { color: palette.green, fontSize: 12, fontWeight: '700' },
});
