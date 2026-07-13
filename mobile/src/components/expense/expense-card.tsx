import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radii, shadow, spacing } from '@/constants/design';
import { formatWon } from '@/utils/format';

type ExpenseCardProps = {
  id: string;
  nickname: string;
  avatar: string;
  category: string;
  amount: number;
  memo?: string;
  photoUri: string;
  occurredAtLabel: string;
  commentCount: number;
  edited?: boolean;
  hideAuthor?: boolean;
  onPress?: (id: string) => void;
};

export function ExpenseCard(props: ExpenseCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => props.onPress?.(props.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.header}>
        {props.hideAuthor ? (
          <View style={styles.expenseDetails}>
            <Text style={styles.category}>{props.category}</Text>
            <Text style={styles.meta}>
              {props.occurredAtLabel}{props.edited ? ' · 수정됨' : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.author}>
            <Text style={styles.avatar}>{props.avatar}</Text>
            <View>
              <Text style={styles.name}>{props.nickname}</Text>
              <Text style={styles.meta}>{props.category} · {props.occurredAtLabel}{props.edited ? ' · 수정됨' : ''}</Text>
            </View>
          </View>
        )}
        <Text style={styles.amount}>{formatWon(props.amount)}</Text>
      </View>
      <Image accessibilityLabel={`${props.category} 지출 사진`} contentFit="cover" source={{ uri: props.photoUri }} style={styles.photo} />
      <View style={styles.footer}>
        {props.memo ? <Text numberOfLines={2} style={styles.memo}>{props.memo}</Text> : null}
        <Text style={styles.comments}>댓글 {props.commentCount}개</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: palette.paper, borderRadius: radii.lg, ...shadow },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  avatar: { fontSize: 24 },
  name: { color: palette.ink, fontSize: 14, fontWeight: '600' },
  expenseDetails: { flex: 1, minWidth: 0 },
  category: { color: palette.ink, fontSize: 14, fontWeight: '700' },
  meta: { color: palette.muted, fontSize: 11, marginTop: 2 },
  amount: { color: palette.coralText, fontSize: 16, fontWeight: '700' },
  photo: { width: '100%', aspectRatio: 16 / 10, backgroundColor: palette.line },
  footer: { padding: spacing.md, gap: spacing.sm },
  memo: { color: palette.ink, fontSize: 14, lineHeight: 20 },
  comments: { color: palette.muted, fontSize: 12 },
});
