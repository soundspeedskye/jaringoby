import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimalAvatar } from '@/components/avatar/animal-avatar';
import { fonts, palette, radii, spacing } from '@/constants/design';
import type { RoomPost } from '@/data/types';
import {
  useLatestRoomNotice,
  useProfiles,
  useRoomPostCommentCounts,
  useRoomPosts,
} from '@/providers/app-data-hooks';

const BOARD_NAME = '냥냥톡톡';

/** 홈에서 방의 최신 이야기와 공지를 가볍게 발견시키는 읽기 전용 진입 카드. */
export function RoomBoardPreview({ roomId }: { roomId: string }) {
  const router = useRouter();
  const posts = useRoomPosts(roomId);
  const notice = useLatestRoomNotice(roomId);
  const latestPost = useMemo(
    () => posts.find((post) => post.kind === 'POST'),
    [posts],
  );
  const shownPosts = useMemo(
    () => [notice, latestPost].filter((post): post is RoomPost => Boolean(post)),
    [latestPost, notice],
  );
  const profiles = useProfiles(shownPosts.map((post) => post.authorId));
  const commentCounts = useRoomPostCommentCounts(shownPosts);
  const openBoard = () => router.push('/room/board');

  return (
    <Pressable
      accessibilityHint="냥냥톡톡 글 목록을 열어요"
      accessibilityLabel={shownPosts.length ? `${BOARD_NAME}, 최신 이야기 보기` : `${BOARD_NAME}, 첫 냥톡 남기기`}
      accessibilityRole="button"
      onPress={openBoard}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      testID="room-board-preview">
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons color={palette.green} name="chat-outline" size={20} />
          <Text accessibilityRole="header" style={styles.title}>{BOARD_NAME}</Text>
        </View>
        <MaterialCommunityIcons color={palette.green} name="chevron-right" size={22} />
      </View>

      {shownPosts.length ? shownPosts.map((post) => {
        const author = profiles.get(post.authorId);
        return (
          <View key={post.id} style={[styles.preview, post.kind === 'NOTICE' && styles.noticePreview]}>
            {post.kind === 'NOTICE' ? (
              <View style={styles.noticeBadge}>
                <MaterialCommunityIcons color={palette.cream} name="pin" size={12} />
                <Text style={styles.noticeBadgeText}>공지</Text>
              </View>
            ) : (
              <View style={styles.authorRow}>
                <AnimalAvatar photoUri={author?.avatarUri} size={24} value={author?.avatar} />
                <Text style={styles.author}>{author?.nickname ?? '알 수 없음'}</Text>
              </View>
            )}
            <Text
              numberOfLines={2}
              style={[styles.body, post.kind === 'NOTICE' && styles.noticeBody]}>
              {post.body}
            </Text>
            {post.kind === 'POST' ? (
              <Text style={styles.meta}>💬 댓글 {commentCounts.get(post.id) ?? 0}개</Text>
            ) : null}
          </View>
        );
      }) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>우리 방의 첫 냥톡을 남겨주세요</Text>
          <Text style={styles.emptyBody}>가볍게 오늘의 절약 이야기를 나눠봐요.</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.xl, padding: spacing.lg, borderWidth: 1, borderColor: palette.line, borderRadius: radii.xl, backgroundColor: palette.cream },
  pressed: { opacity: 0.82 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 19, fontWeight: '700' },
  preview: { padding: spacing.md, borderWidth: 1, borderColor: palette.rule, borderRadius: radii.lg, backgroundColor: palette.paper },
  // 목록 화면(room/board)의 공지 카드와 같은 규칙: 라벨 pill + 진한 테두리 + 굵은 본문.
  noticePreview: { borderColor: palette.lineStrong, marginBottom: spacing.sm },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: palette.green,
  },
  noticeBadgeText: { color: palette.cream, fontFamily: fonts.handBold, fontSize: 11, fontWeight: '700' },
  noticeBody: { fontFamily: fonts.handBold },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  author: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 13, fontWeight: '700' },
  body: { color: palette.ink, fontFamily: fonts.hand, fontSize: 15, lineHeight: 22 },
  meta: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: spacing.sm },
  empty: { minHeight: 82, justifyContent: 'center', paddingVertical: spacing.sm },
  emptyTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 15, fontWeight: '700' },
  emptyBody: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12, marginTop: 5 },
});
