import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, Text, View } from 'react-native';

import { palette, radii, shadow, spacing } from '@/constants/design';
import { formatWon } from '@/utils/format';

type ChallengeHeroProps = {
  title: string;
  daysRemaining: number;
  baseLimit: number;
  appliedLimit: number;
  spent: number;
  joinLabel: string;
};

const ringSize = 132;
const ringStroke = 20;
const radius = (ringSize - ringStroke) / 2;
const circumference = 2 * Math.PI * radius;

export function ChallengeHero({
  title,
  daysRemaining,
  baseLimit,
  appliedLimit,
  spent,
  joinLabel,
}: ChallengeHeroProps) {
  const safeLimit = Math.max(appliedLimit, 1);
  const progress = Math.min(Math.max(spent / safeLimit, 0), 1);
  const remaining = appliedLimit - spent;

  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${remaining < 0 ? `${formatWon(Math.abs(remaining))} 초과` : `${formatWon(remaining)} 남음`}, 적용한도 ${formatWon(appliedLimit)}`}
      style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>WEEKDAY QUEST</Text>
        <Text style={styles.eyebrow}>{daysRemaining <= 0 ? '오늘 종료' : `D-${daysRemaining}`}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.summary}>
        <View style={styles.ringWrap}>
          <Svg accessibilityLabel={`예산 사용률 ${Math.round(progress * 100)}퍼센트`} height={ringSize} width={ringSize}>
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              fill="transparent"
              r={radius}
              stroke={palette.greenSoft}
              strokeWidth={ringStroke}
            />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              fill="transparent"
              r={radius}
              rotation="-90"
              origin={`${ringSize / 2}, ${ringSize / 2}`}
              stroke={spent > appliedLimit ? palette.coral : palette.yellow}
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - progress)}
              strokeLinecap="butt"
              strokeWidth={ringStroke}
            />
          </Svg>
          <View pointerEvents="none" style={styles.ringLabel}>
            <Text numberOfLines={1} style={styles.remainingValue}>
              {formatWon(Math.abs(remaining), false)}
            </Text>
            <Text style={styles.remainingLabel}>{remaining < 0 ? '초과' : '남음'}</Text>
          </View>
        </View>
        <View style={styles.limitCopy}>
          <Text style={styles.joinLabel}>{joinLabel}</Text>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.limitValue}>
            {formatWon(appliedLimit)}
          </Text>
          <Text style={styles.limitLabel}>내 적용한도</Text>
          <View style={styles.basePill}>
            <Text style={styles.basePillText}>기준금액 {formatWon(baseLimit)}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 42,
    borderRadius: radii.xl,
    backgroundColor: palette.green,
    ...shadow,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  eyebrow: { color: palette.cream, fontSize: 13, letterSpacing: 0.6, fontWeight: '500' },
  title: { color: palette.cream, fontSize: 28, fontWeight: '600', marginTop: 12, marginBottom: 22 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  ringWrap: { width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center', inset: 0 },
  remainingValue: { color: palette.cream, fontSize: 16, fontWeight: '600', maxWidth: 86 },
  remainingLabel: { color: palette.cream, fontSize: 13, marginTop: 2 },
  limitCopy: { flex: 1, minWidth: 0 },
  joinLabel: { color: palette.cream, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  limitValue: { color: palette.cream, fontSize: 28, fontWeight: '600' },
  limitLabel: { color: 'rgba(253,246,227,0.82)', fontSize: 13, marginTop: spacing.xs },
  basePill: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  basePillText: { color: palette.cream, fontSize: 11 },
});
