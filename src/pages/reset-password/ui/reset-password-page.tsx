import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field } from '@/shared/ui/field';
import { FormMessage } from '@/shared/ui/form-message';
import { PrimaryButton } from '@/shared/ui/primary-button';
import { Screen } from '@/shared/ui/screen';
import { palette, spacing } from '@/shared/config/design';
import { useSubmit } from '@/shared/lib/use-submit';
import { useSession } from '@/shared/providers/session-provider';

export function ResetPasswordPage() {
  const router = useRouter();
  const { completeRecovery, updatePassword } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const { error, submit, submitting } = useSubmit('비밀번호를 바꾸지 못했어요.');

  const changePassword = () =>
    submit(async () => {
      if (password !== confirmation) return '두 비밀번호가 같지 않아요.';
      await updatePassword(password);
      completeRecovery();
      router.replace('/');
    });

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
        <PrimaryButton label="비밀번호 변경" loading={submitting} onPress={() => void changePassword()} />
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
