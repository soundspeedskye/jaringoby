import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoomPostPollOption, RoomPostPollVote } from '@/shared/api/types';
import { fonts, palette, radii, spacing, tabularNums } from '@/shared/config/design';
import { formatDateLabel } from '@/shared/lib/format';
import { useDeadlineNow } from '@/shared/lib/use-deadline-now';
import { FormMessage } from '@/shared/ui/form-message';
import { PrimaryButton } from '@/shared/ui/primary-button';

export function RoomPostPoll({
  canVote,
  currentUserId,
  onVote,
  options,
  pollClosesAt,
  votes,
}: {
  canVote: boolean;
  currentUserId?: string;
  onVote: (optionId: string) => Promise<void>;
  options: readonly RoomPostPollOption[];
  pollClosesAt?: string;
  votes: readonly RoomPostPollVote[];
}) {
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [draftOptionId, setDraftOptionId] = useState<string | null>(null);
  const [editRequested, setEditRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollClosesAtMs = pollClosesAt ? Date.parse(pollClosesAt) : Number.NaN;
  const now = useDeadlineNow([pollClosesAtMs]);
  const isClosed = !Number.isFinite(pollClosesAtMs) || now >= pollClosesAtMs;
  const selectedOptionId = useMemo(
    () => votes.find((vote) => vote.userId === currentUserId)?.optionId,
    [currentUserId, votes],
  );
  const editing = !selectedOptionId || editRequested;
  const displayedOptionId = editing
    ? (draftOptionId ?? selectedOptionId)
    : selectedOptionId;
  const voteCountByOptionId = useMemo(() => {
    const counts = new Map<string, number>();
    votes.forEach((vote) => counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1));
    return counts;
  }, [votes]);

  if (options.length === 0) return null;

  const selectOption = (optionId: string) => {
    if (!canVote || isClosed || !editing || busyOptionId) return;
    setDraftOptionId(optionId);
    setError(null);
  };

  const confirmVote = () => {
    if (!draftOptionId || !canVote || isClosed || busyOptionId) return;
    setBusyOptionId(draftOptionId);
    setError(null);
    void (async () => {
      try {
        await onVote(draftOptionId);
        setDraftOptionId(null);
        setEditRequested(false);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '투표하지 못했어요.');
      } finally {
        setBusyOptionId(null);
      }
    })();
  };

  const winnerOption = options.reduce<RoomPostPollOption | undefined>((winner, option) => {
    if (!winner) return option;
    const winnerCount = voteCountByOptionId.get(winner.id) ?? 0;
    const optionCount = voteCountByOptionId.get(option.id) ?? 0;
    return optionCount > winnerCount ? option : winner;
  }, undefined);
  const winnerCount = winnerOption ? (voteCountByOptionId.get(winnerOption.id) ?? 0) : 0;
  const winnerCountMatches = options.filter(
    (option) => (voteCountByOptionId.get(option.id) ?? 0) === winnerCount,
  ).length;
  const isTied = isClosed && winnerCount > 0 && winnerCountMatches > 1;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>{isClosed ? '투표 결과' : '투표'}</Text>
        <Text style={styles.count}>
          {isClosed ? `${votes.length}명 참여` : `${formatPollDeadline(pollClosesAt!)}까지`}
        </Text>
      </View>
      {isTied ? (
        <View style={styles.tie}>
          <Text style={styles.tieLabel}>동점입니다</Text>
        </View>
      ) : isClosed && winnerOption && winnerCount > 0 ? (
        <View style={styles.winner}>
          <Text style={styles.winnerLabel}>최다 득표</Text>
          <Text style={styles.winnerValue}>{`${winnerOption.body} · ${winnerCount}표`}</Text>
        </View>
      ) : null}
      <View style={styles.options}>
        {options.map((option) => {
          const selected = option.id === displayedOptionId;
          const count = voteCountByOptionId.get(option.id) ?? 0;
          const percentage = votes.length ? Math.round((count / votes.length) * 100) : 0;
          if (isClosed) {
            return (
              <View key={option.id} style={styles.resultOption}>
                <Text numberOfLines={1} style={styles.optionText}>{option.body}</Text>
                <Text style={styles.optionCount}>{`${count}표 · ${percentage}%`}</Text>
              </View>
            );
          }
          return (
            <Pressable
              accessibilityLabel={`${option.body}, ${count}표${selected ? ', 선택됨' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !canVote || !editing || busyOptionId !== null }}
              disabled={!canVote || !editing || busyOptionId !== null}
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
      {!isClosed && selectedOptionId && !editing ? (
        <View style={styles.savedVote}>
          <Text style={styles.savedVoteText}>
            {`내 선택: ${options.find((option) => option.id === selectedOptionId)?.body ?? ''}`}
          </Text>
          <PrimaryButton
            label="투표 수정"
            onPress={() => {
              setEditRequested(true);
              setError(null);
            }}
            variant="secondary"
          />
        </View>
      ) : null}
      {!isClosed && editing ? (
        <PrimaryButton
          disabled={!draftOptionId || busyOptionId !== null || !canVote}
          label={selectedOptionId ? '변경 확인' : '투표 확인'}
          loading={busyOptionId !== null}
          onPress={confirmVote}
        />
      ) : null}
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
  resultOption: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: palette.rule,
  },
  winner: {
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  winnerLabel: { color: palette.coralText, fontFamily: fonts.handBold, fontSize: 12, fontWeight: '700' },
  winnerValue: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: '700' },
  tie: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(233,135,98,0.14)',
  },
  tieLabel: { color: palette.coralText, fontFamily: fonts.handBold, fontSize: 12, fontWeight: '700' },
  savedVote: { gap: spacing.sm },
  savedVoteText: { color: palette.green, fontFamily: fonts.handBold, fontSize: 13, fontWeight: '700' },
  error: { color: palette.danger, fontFamily: fonts.hand, fontSize: 11, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});

function formatPollDeadline(pollClosesAt: string): string {
  // 저장된 시각은 닫히기 시작하는 00:00이고, 화면에는 허용되는 마지막 분을 보인다.
  return formatDateLabel(new Date(Date.parse(pollClosesAt) - 1));
}
