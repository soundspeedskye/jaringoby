import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import {
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useCurrentUser, useProfiles } from "@/entities/member/api/use-members";
import {
  useLatestRoomNotice,
  useReactionsByPostId,
  useRoomPostCommentCounts,
  useRoomPosts,
} from "@/entities/post/api/use-posts";
import { RoomPostReactionPills } from "@/entities/post/ui/post-reaction-pills";
import { RoomPostCard } from "@/entities/post/ui/room-post-card";
import { useActiveRoom } from "@/entities/room/api/use-rooms";
import type { Profile, RoomPost, RoomPostReaction } from "@/shared/api/types";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { ScreenFrame } from "@/shared/ui/screen";

type BoardRow =
  | { type: "week"; label: string; id: string }
  | { type: "post"; post: RoomPost };

const EMPTY_REACTIONS: RoomPostReaction[] = [];

export function BoardPage() {
  const router = useRouter();
  const refreshControl = usePullToRefreshControl();
  const room = useActiveRoom();
  const currentUser = useCurrentUser();
  const posts = useRoomPosts(room?.id);
  const latestNotice = useLatestRoomNotice(room?.id);
  const listPosts = useMemo(
    () => posts.filter((post) => post.id !== latestNotice?.id),
    [latestNotice?.id, posts],
  );
  const rows = useMemo(() => buildRows(listPosts), [listPosts]);
  const postAuthorIds = useMemo(
    () => posts.map((post) => post.authorId),
    [posts],
  );
  const postIds = useMemo(() => posts.map((post) => post.id), [posts]);
  const profiles = useProfiles(postAuthorIds);
  const reactionsByPostId = useReactionsByPostId(postIds);
  const commentCounts = useRoomPostCommentCounts(posts);
  const { toggleRoomPostReaction } = useAppActions();
  const canWrite = Boolean(room && currentUser && room.status === "OPEN");
  const returnFromBoard = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, [router]);
  const openPost = useCallback(
    (postId: string) => router.push(`/room/board/${postId}`),
    [router],
  );
  const togglePostReaction = useCallback(
    (postId: string, emoji: RoomPostReaction["emoji"]) =>
      void toggleRoomPostReaction(postId, emoji),
    [toggleRoomPostReaction],
  );
  const renderRow = useCallback(
    ({ item }: { item: BoardRow }) => {
      if (item.type === "week")
        return <Text style={styles.week}>{item.label}</Text>;
      const post = item.post;
      return (
        <BoardPostRow
          author={profiles.get(post.authorId)}
          commentCount={commentCounts.get(post.id) ?? 0}
          currentUserId={currentUser?.id}
          onOpen={openPost}
          onToggleReaction={togglePostReaction}
          post={post}
          reactions={reactionsByPostId.get(post.id) ?? EMPTY_REACTIONS}
        />
      );
    },
    [
      commentCounts,
      currentUser?.id,
      openPost,
      profiles,
      reactionsByPostId,
      togglePostReaction,
    ],
  );

  // 냥냥톡톡은 홈의 맥락 콘텐츠다. 목록에서 나갈 때 이전 스택이 아니라
  // Android 시스템 뒤로가기도 헤더와 같은 스택 우선 규칙을 쓴다.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        () => {
          returnFromBoard();
          return true;
        },
      );
      return () => subscription.remove();
    }, [returnFromBoard]),
  );

  return (
    <ScreenFrame
      fixedHeader={
        <PageHeader
          bottomSpacing="md"
          onBack={returnFromBoard}
          right={
            canWrite ? (
              <Pressable
                accessibilityLabel="아낌 기록 남기기"
                accessibilityRole="button"
                onPress={() => router.push("/room/board/new")}
                style={styles.writeButton}
              >
                <MaterialCommunityIcons
                  color={palette.green}
                  name="pencil-outline"
                  size={21}
                />
              </Pressable>
            ) : undefined
          }
          title="아껴씀 청년방"
        />
      }
      testID="room-board-screen"
    >
      <FlatList
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(item) => (item.type === "week" ? item.id : item.post.id)}
        ListEmptyComponent={
          latestNotice ? null : (
            <EmptyState
              description="우리 방의 첫 아낌 기록을 남겨주세요"
              icon="chat-outline"
              title="아직 아낌 기록이 없어요."
            />
          )
        }
        ListHeaderComponent={
          <>
            {latestNotice ? (
              <Pressable
                accessibilityLabel={`공지: ${latestNotice.body}`}
                accessibilityRole="button"
                onPress={() => router.push(`/room/board/${latestNotice.id}`)}
                style={styles.notice}
              >
                <View style={styles.noticeBadge}>
                  <MaterialCommunityIcons
                    color={palette.cream}
                    name="pin"
                    size={14}
                  />
                  <Text style={styles.noticeBadgeText}>공지</Text>
                </View>
                <Text numberOfLines={2} style={styles.noticeBody}>
                  {latestNotice.body}
                </Text>
              </Pressable>
            ) : null}
          </>
        }
        refreshControl={refreshControl}
        renderItem={renderRow}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}

const BoardPostRow = memo(function BoardPostRow({
  author,
  commentCount,
  currentUserId,
  onOpen,
  onToggleReaction,
  post,
  reactions,
}: {
  author?: Profile;
  commentCount: number;
  currentUserId?: string;
  onOpen: (postId: string) => void;
  onToggleReaction: (postId: string, emoji: RoomPostReaction["emoji"]) => void;
  post: RoomPost;
  reactions: readonly RoomPostReaction[];
}) {
  const toggleReaction = useCallback(
    (emoji: RoomPostReaction["emoji"]) => onToggleReaction(post.id, emoji),
    [onToggleReaction, post.id],
  );
  const footer = (
    <View style={styles.postFooter}>
      <RoomPostReactionPills
        currentUserId={currentUserId}
        onToggle={toggleReaction}
        reactions={reactions}
      />
      <View style={styles.comments}>
        <MaterialCommunityIcons
          color={palette.muted}
          name="comment-outline"
          size={16}
        />
        <Text style={styles.commentsText}>댓글 {commentCount}</Text>
      </View>
    </View>
  );
  return (
    <RoomPostCard
      author={author}
      dateLabel={formatDay(post.createdAt)}
      footer={footer}
      onPress={() => onOpen(post.id)}
      post={post}
      variant="list"
    />
  );
});

function buildRows(posts: readonly RoomPost[]): BoardRow[] {
  const rows: BoardRow[] = [];
  let previousLabel = "";
  posts.forEach((post) => {
    const label = formatWeek(post.createdAt);
    if (label !== previousLabel) {
      rows.push({ type: "week", label, id: `week-${label}` });
      previousLabel = label;
    }
    rows.push({ type: "post", post });
  });
  return rows;
}

function formatWeek(value: string): string {
  const date = new Date(value);
  const month = new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    timeZone: "Asia/Seoul",
  }).format(date);
  const first = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const day = date.getDate();
  return `${month} ${Math.ceil((day + first) / 7)}주차`;
}

function formatDay(value: string): string {
  return `${new Intl.DateTimeFormat("ko-KR", { day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value))}`;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: 120 },
  writeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 21,
    backgroundColor: palette.paper,
  },
  // 공지는 일반 글과 같은 종이를 쓰고 라벨·테두리 진하기로만 구분한다.
  notice: {
    marginBottom: spacing.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.lineStrong,
    borderRadius: radii.xl,
    backgroundColor: palette.paper,
  },
  noticeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: palette.green,
  },
  noticeBadgeText: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  noticeBody: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 19,
    lineHeight: 27,
  },
  week: {
    color: palette.muted,
    fontFamily: fonts.handBold,
    fontSize: 17,
    fontWeight: "700",
    marginBottom: spacing.md,
  },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  comments: { flexDirection: "row", alignItems: "center", gap: 4 },
  commentsText: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11 },
});
