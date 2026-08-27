import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette } from '@/shared/config/design';

/**
 * 아바타 오른쪽 위에 얹는 안 읽은 건수 뱃지.
 * 부모가 position: relative 컨테이너를 만들어 준다.
 */
export function UnreadDot({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      accessibilityLabel={`읽지 않은 지출 ${count}건`}
      accessibilityRole="text"
      style={styles.dot}
    >
      <Text style={styles.count}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: palette.cream,
    backgroundColor: palette.stamp,
  },
  count: {
    color: palette.white,
    fontFamily: fonts.handBold,
    fontSize: 10,
    fontWeight: '700',
  },
});
