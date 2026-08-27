import { StyleSheet, Text } from 'react-native';

import { fonts, palette } from '@/shared/config/design';

/** 아직 상세를 열지 않은 항목 표시. 게시글·지출이 같은 도장을 쓴다. */
export function NewBadge() {
  return (
    <Text accessibilityLabel="새 항목" style={styles.badge}>
      NEW
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    color: palette.stamp,
    fontFamily: fonts.handBold,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
