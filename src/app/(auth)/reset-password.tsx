import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/form-message';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Screen } from '@/components/ui/screen';
import { palette, spacing } from '@/constants/design';
import { useSession } from '@/providers/session-provider';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { completeRecovery, updatePassword } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password !== confirmation) {
      setError('두 비밀번호가 같지 않아요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updatePassword(password);
      completeRecovery();
      router.replace('/');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '비밀번호를 바꾸지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen testID="reset-password-screen">
      <View style={styles.header}>
        <MaterialCommunityIcons color={palette.yellow} name="lock-reset" size={38} />
        <Text style={styles.title}>새 비밀번호 설정</Text>
        <Text style={styles.body}>이 링크를 요청한 본인만 새 비밀번호를 설정할 수 있어요.</Text>
      </View>
      <View style={styles.form}>
        <Field autoComplete="new-password" label="새 비밀번호" onChangeText={setPassword} secureTextEntry value={password} />
        <Field autoComplete="new-password" label="새 비밀번호 확인" onChangeText={setConfirmation} secureTextEntry value={confirmation} />
        <FormMessage message={error} />
        <PrimaryButton label="비밀번호 변경" loading={submitting} onPress={() => void submit()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingTop: 90, paddingBottom: spacing.xxxl },
  title: { color: palette.ink, fontSize: 25, fontWeight: '800', marginTop: spacing.md },
  body: { color: palette.muted, fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
  form: { gap: spacing.lg },
});
