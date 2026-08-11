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

  // 스플래시는 폰트 로드만으로 내리지 않는다. 세션이 확정될 때까지 유지해
  // (AuthenticatedApp에서 hideAsync) 세션 확정 전 데이터 계층 마운트를 막는다.
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
  const { loading, recoveryMode, session } = useSession();
  const inAuthGroup = segments[0] === '(auth)';
  // 세션 부트스트랩 중. 이 구간엔 아직 유저가 확정되지 않아 데이터 계층을
  // 마운트하면 signed-out 마운트에서 전체 조회가 한 번 낭비된다(재방문 사용자).
  const bootstrapping = loading;

  useEffect(() => {
    if (loading) return;
    if (!session && !inAuthGroup) router.replace('/sign-in');
    if (session && inAuthGroup && !recoveryMode) router.replace('/');
  }, [inAuthGroup, loading, recoveryMode, router, session]);

  useEffect(() => {
    // 세션 확정까지 스플래시를 유지하고, 준비되면 내린다.
    if (!bootstrapping) void SplashScreen.hideAsync();
  }, [bootstrapping]);

  // 세션이 확정된 뒤에만 데이터 Provider를 마운트한다. 스플래시가 이 구간을
  // 덮으므로 화면 깜빡임 없이 전체 조회가 정확히 1회만 실행된다.
  if (bootstrapping) return null;

  return (
    <AppProvider
      key={session?.user.id ?? 'signed-out'}
      sessionUserId={session?.user.id ?? null}>
      <AppDialogProvider>
        <NotificationCoordinator>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.cream } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="room/create" options={{ presentation: 'modal' }} />
            <Stack.Screen name="room/join" options={{ presentation: 'modal' }} />
            <Stack.Screen name="room/leave" options={{ presentation: 'modal' }} />
            <Stack.Screen name="profile/edit" options={{ presentation: 'modal' }} />
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
