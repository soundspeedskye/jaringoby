import { Tabs } from 'expo-router';

import { SheetTabBar } from '@/shared/ui/sheet-tab-bar';
import { palette } from '@/shared/config/design';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.cream } }}
      tabBar={(props) => <SheetTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="expenses" options={{ title: '내 지출' }} />
      <Tabs.Screen name="community" options={{ title: '커뮤니티' }} />
      <Tabs.Screen name="profile" options={{ title: '내 정보' }} />
    </Tabs>
  );
}
