import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/design';
import { formatWon } from '@/utils/format';

export type MemberListItem = {
  id: string;
  nickname: string;
  avatar: string;
  detail: string;
  remaining: number;
  isCrowned: boolean;
  isLateJoiner?: boolean;
  isCurrentUser?: boolean;
};

export function MemberList({ members }: { members: MemberListItem[] }) {
  return (
    <View accessibilityLabel={`함께하는 멤버 ${members.length}명`} accessibilityRole="list">
      <View style={styles.header}>
        <Text style={styles.heading}>함께하는 멤버</Text>
        <Text accessibilityLabel={`현재 멤버 ${members.length}명`} style={styles.count}>{members.length}명</Text>
      </View>
      {members.map((member, index) => {
        const displayName = member.isCurrentUser ? '나' : member.nickname;
        const balanceLabel = member.remaining < 0
          ? `${formatWon(Math.abs(member.remaining))} 초과`
          : `${formatWon(member.remaining)} 남음`;
        return (
          <View
            accessible
            accessibilityLabel={`${member.isCrowned ? '현재 1위, ' : ''}${displayName}, ${member.detail}, ${balanceLabel}`}
            key={member.id}
            style={[
              styles.row,
              member.isCurrentUser && styles.currentUserRow,
              index === members.length - 1 && styles.lastRow,
            ]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{member.avatar}</Text>
            </View>
            <View style={styles.copy}>
              <View style={styles.nameRow}>
                <Text numberOfLines={1} style={styles.name}>
                  {member.isCrowned ? '👑 ' : ''}
                  {member.isCurrentUser ? '나' : member.nickname}
                </Text>
                {member.isLateJoiner ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>중도 합류</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={styles.detail}>
                {member.detail}
              </Text>
            </View>
            <View style={styles.amount}>
              <Text style={[styles.amountValue, member.remaining < 0 && styles.amountValueOver]}>
                {formatWon(Math.abs(member.remaining), false)}
              </Text>
              <Text style={styles.amountLabel}>{member.remaining < 0 ? '초과' : '남음'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: { color: palette.ink, fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  count: { color: palette.muted, fontSize: 13 },
  row: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(52,49,40,0.12)',
  },
  currentUserRow: {
    backgroundColor: 'rgba(47,113,93,0.055)',
    marginHorizontal: -spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 16,
  },
  lastRow: { borderBottomWidth: 0 },
  avatar: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  avatarText: { fontSize: 22 },
  copy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: palette.ink, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(233,135,98,0.20)',
    backgroundColor: 'rgba(233,135,98,0.10)',
  },
  badgeText: { color: palette.danger, fontSize: 10, fontWeight: '700' },
  detail: { color: palette.ink, fontSize: 12, fontWeight: '500', marginTop: 5 },
  amount: { minWidth: 72, alignItems: 'flex-end' },
  amountValue: { color: palette.green, fontFamily: 'Georgia', fontSize: 19, fontWeight: '600' },
  amountValueOver: { color: palette.danger },
  amountLabel: { color: palette.ink, fontSize: 10, fontWeight: '600', marginTop: 2 },
});
