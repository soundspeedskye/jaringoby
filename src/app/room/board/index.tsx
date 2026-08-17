import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { AnimalAvatar } from '@/shared/ui/animal-avatar';
import { RoomPostReactionPills } from '@/components/room/room-post-reaction-pills';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { ScreenFrame } from '@/shared/ui/screen';
import { fonts, palette, radii, spacing } from '@/shared/config/design';
import type { RoomPost } from '@/shared/api/types';
import { useAppActions } from '@/shared/providers/app-actions-provider';
import {
  useActiveRoom,
  useCurrentUser,
  useLatestRoomNotice,
  useProfiles,
  useReactionsByPostId,
  useRoomPostCommentCounts,
  useRoomPosts,
} from '@/shared/providers/app-data-hooks';

type BoardRow = { type: 'week'; label: string; id: string } | { type: 'post'; post: RoomPost };

export default function RoomBoardScreen() {
  const router = useRouter();
  const room = useActiveRoom();
  const currentUser = useCurrentUser();
  const posts = useRoomPosts(room?.id);
  const latestNotice = useLatestRoomNotice(room?.id);
  const listPosts = useMemo(
    () => posts.filter((post) => post.id !== latestNotice?.id),
    [latestNotice?.id, posts],
  );
  const rows = useMemo(() => buildRows(listPosts), [listPosts]);
  const profiles = useProfiles(posts.map((post) => post.authorId));
  const reactionsByPostId = useReactionsByPostId(posts.map((post) => post.id));
  const commentCounts = useRoomPostCommentCounts(posts);
  const { toggleRoomPostReaction } = useAppActions();
  const canWrite = Boolean(room && currentUser && room.status === 'OPEN');
  const returnToChallengeHome = useCallback(() => router.replace('/'), [router]);

  // 냥냥톡톡은 홈의 맥락 콘텐츠다. 목록에서 나갈 때 이전 스택이 아니라
  // 언제나 챌린지 홈으로 돌아가도록 안드로이드 시스템 뒤로가기도 가로챈다.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      returnToChallengeHome();
      return true;
    });
    return () => subscription.remove();
  }, [returnToChallengeHome]));

  return (
    <ScreenFrame testID="room-board-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(item) => item.type === 'week' ? item.id : item.post.id}
        ListEmptyComponent={latestNotice ? null : (
          <EmptyState
            description="우리 방의 첫 냥톡을 남겨주세요"
            icon="chat-outline"
            title="아직 냥톡이 없어요."
          />
        )}
        ListHeaderComponent={
          <>
            <PageHeader
              bottomSpacing="md"
              onBack={returnToChallengeHome}
              right={canWrite ? (
                <Pressable
                  accessibilityLabel="냥톡 쓰기"
                  accessibilityRole="button"
                  onPress={() => router.push('/room/board/new')}
                  style={styles.writeButton}
                >
                  <MaterialCommunityIcons color={palette.green} name="pencil-outline" size={21} />
                </Pressable>
              ) : undefined}
              title="냥냥톡톡"
            />
            {latestNotice ? (
              <Pressable
                accessibilityLabel={`공지: ${latestNotice.body}`}
                accessibilityRole="button"
                onPress={() => router.push(`/room/board/${latestNotice.id}`)}
                style={styles.notice}
              >
                <View style={styles.noticeBadge}>
                  <MaterialCommunityIcons color={palette.cream} name="pin" size={14} />
                  <Text style={styles.noticeBadgeText}>공지</Text>
                </View>
                <Text numberOfLines={2} style={styles.noticeBody}>{latestNotice.body}</Text>
              </Pressable>
            ) : null}
          </>
        }
        renderItem={({ item }) => {
          if (item.type === 'week') return <Text style={styles.week}>{item.label}</Text>;
          const post = item.post;
          const author = profiles.get(post.authorId);
          return (
            <Pressable
              accessibilityLabel={`${author?.nickname ?? '알 수 없음'}님의 글: ${post.body}`}
              accessibilityRole="button"
              onPress={() => router.push(`/room/board/${post.id}`)}
              style={({ pressed }) => [
                styles.post,
                post.kind === 'NOTICE' && styles.postNotice,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.postHeader}>
                <View style={styles.authorRow}>
                  <AnimalAvatar photoUri={author?.avatarUri} size={40} value={author?.avatar} />
                  <Text style={styles.author}>{author?.nickname ?? '알 수 없음'}</Text>
                </View>
                <Text style={styles.date}>{formatDay(post.createdAt)}</Text>
              </View>
              {post.kind === 'NOTICE' ? (
                <View style={[styles.noticeBadge, styles.postNoticeBadge]}>
                  <MaterialCommunityIcons color={palette.cream} name="pin" size={12} />
                  <Text style={styles.postNoticeBadgeText}>공지</Text>
                </View>
              ) : null}
              <Text
                numberOfLines={3}
                style={[styles.postBody, post.kind === 'NOTICE' && styles.postBodyNotice]}>
                {post.body}
              </Text>
              <View style={styles.postFooter}>
                <RoomPostReactionPills
                  currentUserId={currentUser?.id}
                  onToggle={(emoji) => void toggleRoomPostReaction(post.id, emoji)}
                  reactions={reactionsByPostId.get(post.id) ?? []}
                />
                <View style={styles.comments}>
                  <MaterialCommunityIcons color={palette.muted} name="comment-outline" size={16} />
                  <Text style={styles.commentsText}>댓글 {commentCounts.get(post.id) ?? 0}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}

function buildRows(posts: readonly RoomPost[]): BoardRow[] {
  const rows: BoardRow[] = [];
  let previousLabel = '';
  posts.forEach((post) => {
    const label = formatWeek(post.createdAt);
    if (label !== previousLabel) {
      rows.push({ type: 'week', label, id: `week-${label}` });
      previousLabel = label;
    }
    rows.push({ type: 'post', post });
  });
  return rows;
}

function formatWeek(value: string): string {
  const date = new Date(value);
  const month = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', timeZone: 'Asia/Seoul' }).format(date);
  const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const day = date.getDate();
  return `${month} ${Math.ceil((day + first) / 7)}주차`;
}

function formatDay(value: string): string {
  return `${new Intl.DateTimeFormat('ko-KR', { day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(value))}`;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: 120 },
  writeButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, borderRadius: 21, backgroundColor: palette.paper },
  // 공지는 일반 글과 같은 종이를 쓰고 라벨·테두리 진하기로만 구분한다.
  notice: { marginBottom: spacing.xl, padding: spacing.lg, borderWidth: 1, borderColor: palette.lineStrong, borderRadius: radii.xl, backgroundColor: palette.paper },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: palette.green,
  },
  noticeBadgeText: { color: palette.cream, fontFamily: fonts.handBold, fontSize: 13, fontWeight: '700' },
  noticeBody: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 19, lineHeight: 27 },
  week: { color: palette.muted, fontFamily: fonts.handBold, fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  post: { marginBottom: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.rule, borderRadius: radii.xl, backgroundColor: palette.paper },
  pressed: { opacity: 0.78 },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  author: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 16, fontWeight: '700' },
  date: { color: palette.muted, fontFamily: fonts.number, fontSize: 14 },
  postBody: { color: palette.ink, fontFamily: fonts.hand, fontSize: 18, lineHeight: 27 },
  // 흐름 안에 섞인 지난 공지. 구분이 필요한 자리는 고정 슬롯이 아니라 여기다.
  postNotice: { borderColor: palette.lineStrong },
  postNoticeBadge: { paddingVertical: 2 },
  postNoticeBadgeText: { color: palette.cream, fontFamily: fonts.handBold, fontSize: 11, fontWeight: '700' },
  postBodyNotice: { fontFamily: fonts.handBold },
  postFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.lg },
  comments: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentsText: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11 },
});
