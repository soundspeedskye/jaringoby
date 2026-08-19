import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimalAvatar } from '@/shared/ui/animal-avatar';
import { ExpensePhoto } from '@/entities/expense/ui/expense-photo';
import { fonts, palette, radii, shadow, spacing, tabularNums } from '@/shared/config/design';
import { formatWon } from '@/shared/lib/format';

type ExpenseCardProps = {
  id: string;
  nickname: string;
  avatar: string;
  avatarUri?: string;
  category: string;
  amount: number;
  pointAmount: number;
  memo?: string;
  photoUri?: string;
  photoThumbnailUri?: string;
  photoPath?: string;
  occurredAtLabel: string;
  commentCount: number;
  edited?: boolean;
  hideAuthor?: boolean;
  onPress?: (id: string) => void;
};

export const ExpenseCard = memo(function ExpenseCard(props: ExpenseCardProps) {
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
            <AnimalAvatar photoUri={props.avatarUri} value={props.avatar} size={32} />
            <View>
              <Text style={styles.name}>{props.nickname}</Text>
              <Text style={styles.meta}>{props.category} · {props.occurredAtLabel}{props.edited ? ' · 수정됨' : ''}</Text>
            </View>
          </View>
        )}
        <View style={styles.amounts}>
          <Text style={styles.amount}>{formatWon(props.amount)}</Text>
          {props.pointAmount > 0 ? (
            <Text style={styles.pointAmount}>포인트 {formatWon(props.pointAmount)}</Text>
          ) : null}
        </View>
      </View>
      <ExpensePhoto
        accessibilityLabel={`${props.category} 지출 사진`}
        photoPath={props.photoPath}
        photoThumbnailUri={props.photoThumbnailUri}
        photoUri={props.photoUri}
        style={styles.photo}
        variant="thumbnail"
      />
      <View style={styles.footer}>
        {props.memo ? <Text numberOfLines={2} style={styles.memo}>{props.memo}</Text> : null}
        <Text style={styles.comments}>댓글 {props.commentCount}개</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden', backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, borderRadius: radii.lg, ...shadow },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  author: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  name: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: '600' },
  expenseDetails: { flex: 1, minWidth: 0 },
  category: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: '700' },
  meta: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: 2 },
  amount: { color: palette.coralText, fontFamily: fonts.number, fontSize: 16, fontWeight: '700', ...tabularNums },
  amounts: { alignItems: 'flex-end', marginLeft: spacing.sm },
  pointAmount: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10, marginTop: 2, ...tabularNums },
  photo: { width: '100%', aspectRatio: 16 / 10, backgroundColor: palette.line },
  footer: { padding: spacing.md, gap: spacing.sm },
  memo: { color: palette.ink, fontFamily: fonts.hand, fontSize: 14, lineHeight: 20 },
  comments: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
});
