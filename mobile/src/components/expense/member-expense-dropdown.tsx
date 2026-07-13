import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MemberListItem } from '@/components/challenge/member-list';
import { ExpenseCard } from '@/components/expense/expense-card';
import { palette, radii, spacing } from '@/constants/design';
import type { Expense } from '@/data/types';
import { formatDateLabel, formatWon } from '@/utils/format';

type MemberExpenseDropdownProps = {
  member: MemberListItem;
  expenses: Expense[];
  getCommentCount: (expenseId: string) => number;
  onExpensePress: (expenseId: string) => void;
};

export const MemberExpenseDropdown = memo(function MemberExpenseDropdown({
  member,
  expenses,
  getCommentCount,
  onExpensePress,
}: MemberExpenseDropdownProps) {
  const [expanded, setExpanded] = useState(false);
  const sortedExpenses = useMemo(
    () => [...expenses].sort((a, b) => {
      const occurredAtDifference = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
      return occurredAtDifference || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }),
    [expenses],
  );
  const total = sortedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const displayName = member.isCurrentUser ? '나' : member.nickname;

  return (
    <View style={[styles.container, expanded && styles.containerExpanded]}>
      <Pressable
        accessibilityHint={`누르면 ${displayName}님의 지출 목록을 ${expanded ? '접습니다' : '펼칩니다'}`}
        accessibilityLabel={`${member.isCrowned ? '현재 1위, ' : ''}${displayName}, 지출 ${sortedExpenses.length}건, 총 ${formatWon(total)}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{member.avatar}</Text>
        </View>

        <View style={styles.memberCopy}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {member.isCrowned ? '👑 ' : ''}{displayName}
            </Text>
            {member.isLateJoiner ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>중도 합류</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.summary}>
            {sortedExpenses.length ? `${sortedExpenses.length}건 · 총 ${formatWon(total)}` : '아직 지출 없음'}
          </Text>
        </View>

        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <MaterialCommunityIcons
            color={expanded ? palette.cream : palette.green}
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={22}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View accessibilityRole="list" style={styles.expenseList}>
          {sortedExpenses.length ? sortedExpenses.map((expense, index) => (
            <View key={expense.id}>
              <ExpenseCard
                amount={expense.amount}
                avatar={member.avatar}
                category={expense.category}
                commentCount={getCommentCount(expense.id)}
                edited={expense.createdAt !== expense.updatedAt}
                hideAuthor
                id={expense.id}
                memo={expense.memo}
                nickname={`${member.isCrowned ? '👑 ' : ''}${displayName}`}
                occurredAtLabel={formatDateLabel(expense.occurredAt)}
                onPress={onExpensePress}
                photoUri={expense.photoUri ?? ''}
              />
              {index < sortedExpenses.length - 1 ? (
                <View style={styles.expenseSeparator} />
              ) : null}
            </View>
          )) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons color={palette.greenSoft} name="camera-outline" size={22} />
              <Text style={styles.emptyText}>{displayName}님의 지출 기록이 아직 없어요.</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}, areMemberExpenseDropdownPropsEqual);

function areMemberExpenseDropdownPropsEqual(
  previous: MemberExpenseDropdownProps,
  next: MemberExpenseDropdownProps,
): boolean {
  const previousMember = previous.member;
  const nextMember = next.member;
  return (
    previous.expenses === next.expenses &&
    previous.getCommentCount === next.getCommentCount &&
    previous.onExpensePress === next.onExpensePress &&
    previousMember.id === nextMember.id &&
    previousMember.nickname === nextMember.nickname &&
    previousMember.avatar === nextMember.avatar &&
    previousMember.detail === nextMember.detail &&
    previousMember.remaining === nextMember.remaining &&
    previousMember.isCrowned === nextMember.isCrowned &&
    previousMember.isLateJoiner === nextMember.isLateJoiner &&
    previousMember.isCurrentUser === nextMember.isCurrentUser
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(52,49,40,0.10)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,253,247,0.56)',
  },
  containerExpanded: {
    borderColor: 'rgba(47,113,93,0.24)',
    backgroundColor: 'rgba(255,253,247,0.82)',
  },
  trigger: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  triggerPressed: { backgroundColor: 'rgba(47,113,93,0.06)' },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    backgroundColor: 'rgba(255,255,255,0.68)',
  },
  avatarText: { fontSize: 21 },
  memberCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: palette.ink, fontSize: 15, fontWeight: '700' },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(233,135,98,0.11)',
  },
  badgeText: { color: palette.danger, fontSize: 9, fontWeight: '700' },
  summary: { color: palette.muted, fontSize: 12, marginTop: 5 },
  chevron: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(47,113,93,0.09)',
  },
  chevronExpanded: { backgroundColor: palette.green },
  expenseList: {
    padding: spacing.md,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(47,113,93,0.18)',
  },
  expenseSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
    backgroundColor: palette.line,
  },
  emptyState: {
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyText: { color: palette.muted, fontSize: 12 },
});
