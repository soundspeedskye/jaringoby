import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, palette, radii, spacing } from '@/constants/design';
import { ROOM_POST_REACTION_EMOJIS, type RoomPostReaction } from '@/data/types';

export function RoomPostReactionPills({
  currentUserId,
  onToggle,
  reactions,
}: {
  currentUserId?: string;
  reactions: readonly RoomPostReaction[];
  onToggle: (emoji: (typeof ROOM_POST_REACTION_EMOJIS)[number]) => void;
}) {
  return (
    <View accessibilityLabel="글 반응" style={styles.row}>
      {ROOM_POST_REACTION_EMOJIS.map((emoji) => {
        const sameEmoji = reactions.filter((reaction) => reaction.emoji === emoji);
        const mine = sameEmoji.some((reaction) => reaction.userId === currentUserId);
        if (sameEmoji.length === 0 && emoji !== '❤️') return null;
        return (
          <Pressable
            accessibilityLabel={`${emoji} 반응 ${sameEmoji.length}개`}
            accessibilityRole="button"
            key={emoji}
            onPress={(event) => {
              event.stopPropagation();
              onToggle(emoji);
            }}
            style={({ pressed }) => [styles.pill, mine && styles.selected, pressed && styles.pressed]}
          >
            <Text style={styles.emoji}>{emoji}</Text>
            {sameEmoji.length ? <Text style={styles.count}>{sameEmoji.length}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: palette.line, borderRadius: radii.pill, backgroundColor: palette.paper },
  selected: { borderColor: palette.green, backgroundColor: 'rgba(47,113,93,0.08)' },
  pressed: { opacity: 0.7 },
  emoji: { fontSize: 17 },
  count: { color: palette.ink, fontFamily: fonts.number, fontSize: 13, fontWeight: '700' },
});
