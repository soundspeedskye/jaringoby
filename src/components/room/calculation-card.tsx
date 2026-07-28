import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/design';
import { formatWon } from '@/utils/format';

type CalculationCardProps = {
  joinLabel: string;
  holidayCount: number;
  baseLimit: number;
  remainingEligibleDays: number;
  totalSelectedDays: number;
  appliedLimit: number;
};

export function CalculationCard({
  joinLabel,
  holidayCount,
  baseLimit,
  remainingEligibleDays,
  totalSelectedDays,
  appliedLimit,
}: CalculationCardProps) {
  return (
    <View accessibilityLabel="내 한도 계산" style={styles.container}>
      <Text style={styles.title}>내 한도 계산</Text>
      <Text style={styles.meta}>{joinLabel} · 공휴일 {holidayCount}일</Text>
      <Text style={styles.formula}>
        {formatWon(baseLimit, false)} × {remainingEligibleDays}일 ÷ {totalSelectedDays}일 = {formatWon(appliedLimit)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: palette.coral,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
  title: { color: palette.ink, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  meta: { color: palette.ink, fontSize: 12, marginBottom: 2 },
  formula: { color: palette.ink, fontSize: 12 },
});
