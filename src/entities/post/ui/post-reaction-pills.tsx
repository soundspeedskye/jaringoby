import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  QUICK_ROOM_POST_REACTION_EMOJIS,
  ROOM_POST_REACTION_EMOJIS,
  type RoomPostReaction,
} from '@/shared/api/types';
import { fonts, palette, radii, spacing } from '@/shared/config/design';
import { CommentReactionIcon } from '@/shared/ui/comment-reaction-icon';

export function RoomPostReactionPills({
  canReact,
  currentUserId,
  onToggle,
  reactions,
}: {
  canReact: boolean;
  currentUserId?: string;
  reactions: readonly RoomPostReaction[];
  onToggle: (emoji: (typeof ROOM_POST_REACTION_EMOJIS)[number]) => void;
}) {
  const [picker, setPicker] = useState<'closed' | 'quick' | 'all'>('closed');
  const togglePicker = () => {
    setPicker((current) => {
      if (current === 'closed') return 'quick';
      if (current === 'quick') return 'all';
      return 'closed';
    });
  };
  const chooseReaction = (emoji: (typeof ROOM_POST_REACTION_EMOJIS)[number]) => {
    onToggle(emoji);
    setPicker('closed');
  };

  return (
    <View accessibilityLabel="글 반응" style={styles.row}>
      <View style={styles.controls}>
        {ROOM_POST_REACTION_EMOJIS.filter((emoji) =>
          reactions.some((reaction) => reaction.emoji === emoji),
        ).map((emoji) => {
          const sameEmoji = reactions.filter((reaction) => reaction.emoji === emoji);
          const mine = sameEmoji.some((reaction) => reaction.userId === currentUserId);
          return (
            <Pressable
              accessibilityLabel={`${emoji} 반응 ${sameEmoji.length}개${mine ? ', 선택됨' : ''}`}
              accessibilityRole="button"
              disabled={!canReact}
              key={emoji}
              onPress={(event) => {
                event.stopPropagation();
                chooseReaction(emoji);
              }}
              style={({ pressed }) => [
                styles.pill,
                mine && styles.selected,
                pressed && styles.pressed,
                !canReact && styles.disabled,
              ]}
            >
              <CommentReactionIcon emoji={emoji} size={21} />
              <Text style={styles.count}>{sameEmoji.length}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityLabel={picker === 'quick' ? '전체 반응 보기' : '반응 이모지 추가'}
          accessibilityRole="button"
          disabled={!canReact}
          onPress={(event) => {
            event.stopPropagation();
            togglePicker();
          }}
          style={({ pressed }) => [
            styles.addButton,
            pressed && styles.pressed,
            !canReact && styles.disabled,
          ]}
        >
          <MaterialCommunityIcons
            color={palette.muted}
            name="emoticon-plus-outline"
            size={21}
          />
        </Pressable>
      </View>
      {picker !== 'closed' ? (
        <View style={styles.picker}>
          {(picker === 'quick'
            ? QUICK_ROOM_POST_REACTION_EMOJIS
            : ROOM_POST_REACTION_EMOJIS
          ).map((emoji) => {
            const selected = reactions.some(
              (reaction) => reaction.emoji === emoji && reaction.userId === currentUserId,
            );
            return (
              <Pressable
                accessibilityLabel={`${emoji} 반응${selected ? ', 선택됨' : ''}`}
                accessibilityRole="button"
                disabled={!canReact}
                key={emoji}
                onPress={(event) => {
                  event.stopPropagation();
                  chooseReaction(emoji);
                }}
                style={({ pressed }) => [
                  styles.pickerButton,
                  selected && styles.selected,
                  pressed && styles.pressed,
                  !canReact && styles.disabled,
                ]}
              >
                <CommentReactionIcon emoji={emoji} size={29} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', gap: 4 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: palette.line, borderRadius: radii.pill, backgroundColor: palette.paper },
  addButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: radii.pill, backgroundColor: palette.paper },
  picker: { alignSelf: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 6, borderWidth: 1, borderColor: palette.line, borderRadius: radii.lg, backgroundColor: palette.paper },
  pickerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  selected: { borderColor: palette.green, backgroundColor: 'rgba(47,113,93,0.08)' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
  count: { color: palette.ink, fontFamily: fonts.number, fontSize: 13, fontWeight: '700' },
});
