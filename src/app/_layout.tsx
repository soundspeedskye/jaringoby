import 'react-native-url-polyfill/auto';

import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { palette } from '@/constants/design';
import { AppProvider } from '@/providers/app-provider';
import { AppDialogProvider } from '@/providers/app-dialog-provider';
import { NotificationCoordinator } from '@/providers/notification-coordinator';
import { SessionProvider, useSession } from '@/providers/session-provider';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // 폰트 패밀리명은 이 map의 key로 등록된다(fonts.hand 토큰과 일치).
  const [fontsLoaded, fontError] = useFonts({
    GoodNeighbors: require('../../assets/fonts/GoodNeighbors-Regular.otf'),
    'GoodNeighbors-Bold': require('../../assets/fonts/GoodNeighbors-Bold.otf'),
    'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.ttf'),
    'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.ttf'),
    'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.ttf'),
    'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.ttf'),
  });

  useEffect(() => {
    // 폰트가 준비되거나 실패해도 스플래시는 내린다(실패 시 시스템 폰트로 폴백).
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SessionProvider>
      <AuthenticatedApp />
    </SessionProvider>
  );
}

function AuthenticatedApp() {
  const router = useRouter();
  const segments = useSegments();
  const { loading, recoveryMode, requiresAuth, session } = useSession();
  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    if (loading || !requiresAuth) return;
    if (!session && !inAuthGroup) router.replace('/sign-in');
    if (session && inAuthGroup && !recoveryMode) router.replace('/');
  }, [inAuthGroup, loading, recoveryMode, requiresAuth, router, session]);

  return (
    <AppProvider
      key={session?.user.id ?? (requiresAuth ? 'signed-out' : 'demo')}
      sessionUserId={session?.user.id ?? null}>
      <AppDialogProvider>
        <NotificationCoordinator>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cream } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="room/create" options={{ presentation: 'modal' }} />
            <Stack.Screen name="room/join" options={{ presentation: 'modal' }} />
            <Stack.Screen name="expense/new" options={{ presentation: 'modal' }} />
            <Stack.Screen name="expense/[id]" />
            <Stack.Screen name="history/index" />
            <Stack.Screen name="history/[id]" />
          </Stack>
        </NotificationCoordinator>
      </AppDialogProvider>
    </AppProvider>
  );
}
