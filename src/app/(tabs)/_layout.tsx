import { Tabs } from 'expo-router';

import { SheetTabBar } from '@/components/navigation/sheet-tab-bar';
import { palette } from '@/constants/design';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.cream } }}
      tabBar={(props) => <SheetTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: '챌린지' }} />
      <Tabs.Screen name="expenses" options={{ title: '내 지출' }} />
      <Tabs.Screen name="profile" options={{ title: '내 정보' }} />
    </Tabs>
  );
}
