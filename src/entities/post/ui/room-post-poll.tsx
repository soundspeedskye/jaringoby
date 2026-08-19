import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoomPostPollOption, RoomPostPollVote } from '@/shared/api/types';
import { fonts, palette, radii, spacing, tabularNums } from '@/shared/config/design';
import { FormMessage } from '@/shared/ui/form-message';

export function RoomPostPoll({
  canVote,
  currentUserId,
  onVote,
  options,
  votes,
}: {
  canVote: boolean;
  currentUserId?: string;
  onVote: (optionId: string) => Promise<void>;
  options: readonly RoomPostPollOption[];
  votes: readonly RoomPostPollVote[];
}) {
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedOptionId = useMemo(
    () => votes.find((vote) => vote.userId === currentUserId)?.optionId,
    [currentUserId, votes],
  );
  const voteCountByOptionId = useMemo(() => {
    const counts = new Map<string, number>();
    votes.forEach((vote) => counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1));
    return counts;
  }, [votes]);

  if (options.length === 0) return null;

  const selectOption = (optionId: string) => {
    if (!canVote || busyOptionId || optionId === selectedOptionId) return;
    setBusyOptionId(optionId);
    setError(null);
    void (async () => {
      try {
        await onVote(optionId);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '투표하지 못했어요.');
      } finally {
        setBusyOptionId(null);
      }
    })();
  };

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>투표</Text>
        <Text style={styles.count}>{votes.length}명 참여</Text>
      </View>
      <View style={styles.options}>
        {options.map((option) => {
          const selected = option.id === selectedOptionId;
          const count = voteCountByOptionId.get(option.id) ?? 0;
          return (
            <Pressable
              accessibilityLabel={`${option.body}, ${count}표${selected ? ', 내가 선택함' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !canVote || busyOptionId !== null }}
              disabled={!canVote || busyOptionId !== null}
              key={option.id}
              onPress={() => selectOption(option.id)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && canVote && styles.pressed,
              ]}
            >
              <MaterialCommunityIcons
                color={selected ? palette.green : palette.muted}
                name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                size={20}
              />
              <Text numberOfLines={1} style={[styles.optionText, selected && styles.optionTextSelected]}>
                {option.body}
              </Text>
              <Text style={styles.optionCount}>{count}</Text>
            </Pressable>
          );
        })}
      </View>
      {canVote ? <Text style={styles.hint}>한 가지를 고를 수 있고, 다시 선택할 수 있어요.</Text> : null}
      <FormMessage message={error} style={styles.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(168,79,61,0.28)',
    borderRadius: radii.md,
    backgroundColor: 'rgba(233,135,98,0.08)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: palette.coralText, fontFamily: fonts.handBold, fontSize: 13, fontWeight: '700' },
  count: { color: palette.muted, fontFamily: fonts.number, fontSize: 11, ...tabularNums },
  options: { gap: spacing.sm },
  option: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  optionSelected: { borderColor: palette.green, backgroundColor: 'rgba(47,113,93,0.08)' },
  optionText: { flex: 1, color: palette.ink, fontFamily: fonts.hand, fontSize: 13 },
  optionTextSelected: { fontFamily: fonts.handBold, fontWeight: '700' },
  optionCount: { color: palette.muted, fontFamily: fonts.number, fontSize: 12, ...tabularNums },
  hint: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, lineHeight: 16 },
  error: { color: palette.danger, fontFamily: fonts.hand, fontSize: 11, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
