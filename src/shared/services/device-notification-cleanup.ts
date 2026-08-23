import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * 기기 알림(로컬 알림)은 모두 걷어냈고, 소식은 앱 안 소식함으로만 전달한다.
 *
 * 다만 이전 빌드가 OS에 걸어둔 예약은 앱에서 코드를 지운다고 사라지지 않는다.
 * 주차 알림은 그 주차가 끝날 때까지, 예외 보류 리마인더는 보정 마감까지 매일
 * 계속 울린다. 그래서 실행할 때마다 남은 예약과 이미 도착한 알림을 정리한다.
 *
 * 이 앱은 예약 알림을 더 이상 만들지 않으므로 여기서 지우는 건 전부 옛 빌드가
 * 남긴 것이다. 모든 사용자가 이 빌드를 한 번씩 실행하고 나면 지워도 된다.
 */
export async function cancelLegacyDeviceNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
}
