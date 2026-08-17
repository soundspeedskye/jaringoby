import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AnimalAvatar } from '@/shared/ui/animal-avatar';
import { RoomPostReactionPills } from '@/entities/post/ui/post-reaction-pills';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { PrimaryButton } from '@/shared/ui/primary-button';
import { ScreenFrame } from '@/shared/ui/screen';
import { fonts, palette, radii, spacing } from '@/shared/config/design';
import { useAppActions } from '@/shared/providers/app-actions-provider';
import {
  useCurrentUser,
  useProfiles,
  useReactionsByPostId,
  useRoomPost,
  useRoomPostComments,
} from '@/shared/providers/app-data-hooks';
import { createUuid } from '@/shared/lib/uuid';

export function BoardDetailPage() {
  const router = useRouter();
  const { id: postId } = useLocalSearchParams<'/room/board/[id]'>();
  const post = useRoomPost(postId);
  const currentUser = useCurrentUser();
  const allComments = useRoomPostComments(post?.id);
  const comments = useMemo(
    () => allComments.filter((comment) => !comment.deletedAt)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
    [allComments],
  );
  const profiles = useProfiles([
    ...(post ? [post.authorId] : []),
    ...comments.map((comment) => comment.authorId),
  ]);
  const reactionsByPostId = useReactionsByPostId(post ? [post.id] : []);
  const { addRoomPostComment, toggleRoomPostReaction } = useAppActions();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnToBoard = () => router.replace('/room/board');
  if (!post || post.deletedAt) {
    return (
      <ScreenFrame testID="room-board-detail-screen">
        <View style={styles.emptyScreen}>
          <PageHeader onBack={returnToBoard} title="냥냥톡톡" />
          <EmptyState
            action={<PrimaryButton label="목록으로 가기" onPress={returnToBoard} variant="secondary" />}
            icon="chat-remove-outline"
            title="삭제되었거나 없는 냥톡이에요."
          />
        </View>
      </ScreenFrame>
    );
  }

  const author = profiles.get(post.authorId);
  const sendComment = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await addRoomPostComment({ postId: post.id, body, clientRequestId: createUuid() });
      setDraft('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '댓글을 남기지 못했어요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <ScreenFrame testID="room-board-detail-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <FlatList
          contentContainerStyle={styles.content}
          data={comments}
          keyExtractor={(comment) => comment.id}
          ListHeaderComponent={
            <>
              <PageHeader bottomSpacing="md" onBack={returnToBoard} title="냥냥톡톡" />
              <View style={[styles.post, post.kind === 'NOTICE' && styles.postNotice]}>
                {post.kind === 'NOTICE' ? (
                  <View style={styles.noticeBadge}>
                    <MaterialCommunityIcons color={palette.cream} name="pin" size={14} />
                    <Text style={styles.noticeBadgeText}>공지</Text>
                  </View>
                ) : null}
                <View style={styles.postHeader}>
                  <View style={styles.authorRow}>
                    <AnimalAvatar photoUri={author?.avatarUri} size={42} value={author?.avatar} />
                    <View>
                      <Text style={styles.author}>{author?.nickname ?? '알 수 없음'}</Text>
                      <Text style={styles.date}>{formatFullDate(post.createdAt)}</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.body}>{post.body}</Text>
                <RoomPostReactionPills
                  currentUserId={currentUser?.id}
                  onToggle={(emoji) => void toggleRoomPostReaction(post.id, emoji)}
                  reactions={reactionsByPostId.get(post.id) ?? []}
                />
              </View>
              <Text style={styles.commentTitle}>댓글 {comments.length}</Text>
            </>
          }
          ListEmptyComponent={<Text style={styles.noComments}>첫 댓글을 남겨주세요.</Text>}
          renderItem={({ item: comment }) => {
            const commentAuthor = profiles.get(comment.authorId);
            return (
              <View style={styles.comment}>
                <AnimalAvatar photoUri={commentAuthor?.avatarUri} size={32} value={commentAuthor?.avatar} />
                <View style={styles.commentCopy}>
                  <View style={styles.commentMeta}>
                    <Text style={styles.commentAuthor}>{commentAuthor?.nickname ?? '알 수 없음'}</Text>
                    <Text style={styles.commentDate}>{formatFullDate(comment.createdAt)}</Text>
                  </View>
                  <Text style={styles.commentBody}>{comment.body}</Text>
                </View>
              </View>
            );
          }}
          showsVerticalScrollIndicator={false}
        />
        <View style={styles.composer}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.composerRow}>
            <TextInput
              accessibilityLabel="댓글 내용"
              editable={!sending}
              maxLength={300}
              multiline
              onChangeText={setDraft}
              placeholder="댓글 남기기…"
              placeholderTextColor={palette.muted}
              style={styles.input}
              value={draft}
            />
            <Pressable
              accessibilityLabel="댓글 보내기"
              accessibilityRole="button"
              disabled={!draft.trim() || sending}
              onPress={() => void sendComment()}
              style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
            >
              <MaterialCommunityIcons color={palette.cream} name="arrow-up" size={21} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenFrame>
  );
}

function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date(value));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  emptyScreen: { flex: 1, paddingHorizontal: spacing.xl },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  post: { padding: spacing.lg, borderWidth: 1, borderColor: palette.line, borderRadius: radii.xl, backgroundColor: palette.paper },
  // 목록·홈 미리보기의 공지 카드와 같은 규칙: 라벨 pill + 진한 테두리.
  postNotice: { borderColor: palette.lineStrong },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: palette.green,
  },
  noticeBadgeText: { color: palette.cream, fontFamily: fonts.handBold, fontSize: 13, fontWeight: '700' },
  postHeader: { marginBottom: spacing.lg },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  author: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 16, fontWeight: '700' },
  date: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: 3 },
  body: { color: palette.ink, fontFamily: fonts.hand, fontSize: 18, lineHeight: 28, marginBottom: spacing.xl },
  commentTitle: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 18, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.md },
  noComments: { color: palette.muted, fontFamily: fonts.hand, fontSize: 13, paddingVertical: spacing.lg },
  comment: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.rule },
  commentCopy: { flex: 1, minWidth: 0 },
  commentMeta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  commentAuthor: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 13, fontWeight: '700' },
  commentDate: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10 },
  commentBody: { color: palette.ink, fontFamily: fonts.hand, fontSize: 14, lineHeight: 21, marginTop: 4 },
  composer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.cream },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: { flex: 1, minHeight: 46, maxHeight: 110, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: palette.ink, fontFamily: fonts.hand, fontSize: 14, borderWidth: 1, borderColor: palette.line, borderRadius: radii.lg, backgroundColor: palette.paper },
  send: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: palette.green },
  sendDisabled: { opacity: 0.4 },
  error: { color: palette.danger, fontFamily: fonts.hand, fontSize: 11, marginBottom: 5 },
});
