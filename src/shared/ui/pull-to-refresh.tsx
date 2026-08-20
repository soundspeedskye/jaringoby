import { useCallback, useState, type ReactElement } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

import { palette } from '@/shared/config/design';
import { useAppStatusActions } from '@/shared/providers/app-status-provider';

/**
 * 목록 화면의 "당겨서 새로고침". 돌려주는 엘리먼트를 스크롤 컨테이너의
 * refreshControl에 그대로 넘긴다.
 *
 * 전역 loading을 올리지 않는 silent 경로로 갱신한다(→ app-status-provider).
 * 올리면 화면이 통째로 스피너로 바뀌어 당김 인디케이터가 같이 사라진다.
 *
 * 채팅형 스크롤(댓글 스레드)에는 붙이지 않는다. 위로 당기는 동작이
 * 이전 대화 불러오기로 읽혀 새로고침과 뜻이 충돌한다.
 */
export function usePullToRefreshControl(): ReactElement<RefreshControlProps> {
  const { refresh } = useAppStatusActions();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refresh({ silent: true }).finally(() => setRefreshing(false));
  }, [refresh]);

  return (
    <RefreshControl
      colors={[palette.green]}
      onRefresh={onRefresh}
      refreshing={refreshing}
      tintColor={palette.green}
    />
  );
}
