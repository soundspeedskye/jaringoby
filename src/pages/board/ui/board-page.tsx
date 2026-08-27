import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter, useSegments } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useCurrentUser, useProfiles } from "@/entities/member/api/use-members";
import {
  useReactionsByPostId,
  useRoomPostCommentCounts,
  useRoomPosts,
  useUnreadRoomPostIds,
} from "@/entities/post/api/use-posts";
import { useActiveRoom } from "@/entities/room/api/use-rooms";
import type { Profile, RoomPost, RoomPostReaction } from "@/shared/api/types";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { formatWon } from "@/shared/lib/format";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { ScreenFrame } from "@/shared/ui/screen";

const EMPTY_REACTIONS: RoomPostReaction[] = [];

export function BoardPage() {
  const router = useRouter();
  const segments = useSegments();
  const tab = segments[0] === "(tabs)" && segments[1] === "community";
  const refreshControl = usePullToRefreshControl();
  const room = useActiveRoom();
  const { currentPeriod } = useCurrentRoom();
  const currentUser = useCurrentUser();
  const allPosts = useRoomPosts(room?.id);
  const posts = useMemo(
    () => allPosts.filter((post) => !post.deletedAt && post.periodId === currentPeriod?.id),
    [allPosts, currentPeriod?.id],
  );
  // 공지는 작성된 주차와 관계없이, 삭제될 때까지 게시판 맨 위에 고정한다.
  // 여러 공지가 있으면 최신순으로 모두 보여 준다.
  const notices = useMemo(
    () => allPosts.filter((post) => !post.deletedAt && post.kind === "NOTICE"),
    [allPosts],
  );
  const listPosts = useMemo(
    () => posts.filter((post) => post.kind !== "NOTICE"),
    [posts],
  );
  const profiles = useProfiles(posts.map((post) => post.authorId));
  const reactionsByPostId = useReactionsByPostId(posts.map((post) => post.id));
  const commentCounts = useRoomPostCommentCounts(posts);
  const unreadPostIds = useUnreadRoomPostIds(room?.id, currentUser?.id, currentPeriod?.id);
  const canWrite = Boolean(room && currentUser && room.status === "OPEN" && currentPeriod);

  const returnFromBoard = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);
  const openPost = useCallback((postId: string) => router.push(`/room/board/${postId}`), [router]);
  const renderPost = useCallback(({ item }: { item: RoomPost }) => (
    <BoardPostRow
      author={profiles.get(item.authorId)}
      commentCount={commentCounts.get(item.id) ?? 0}
      onOpen={openPost}
      post={item}
      reactions={reactionsByPostId.get(item.id) ?? EMPTY_REACTIONS}
      unread={unreadPostIds.has(item.id)}
    />
  ), [commentCounts, openPost, profiles, reactionsByPostId, unreadPostIds]);

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (tab) return false;
      returnFromBoard();
      return true;
    });
    return () => subscription.remove();
  }, [returnFromBoard, tab]));

  return (
    <ScreenFrame
      fixedHeaderDivider
      fixedHeader={<PageHeader bottomSpacing="md" onBack={tab ? undefined : returnFromBoard} right={canWrite ? <Pressable accessibilityLabel="글 남기기" accessibilityRole="button" onPress={() => router.push("/room/board/new")} style={styles.writeButton}><MaterialCommunityIcons color={palette.green} name="pencil-outline" size={21} style={styles.writeIcon} /></Pressable> : undefined} title="아껴씀 청년방" />}
      testID="room-board-screen"
    >
      <FlatList
        contentContainerStyle={styles.content}
        data={listPosts}
        keyExtractor={(post) => post.id}
        ListEmptyComponent={notices.length ? null : <EmptyState description="이번 주 첫 글을 남겨주세요" icon="chat-outline" title="아직 게시글이 없어요." />}
        ListHeaderComponent={notices.length ? (
          <View style={styles.noticeList}>
            {notices.map((notice) => (
              <Pressable accessibilityLabel={`공지: ${notice.title ?? notice.body}`} accessibilityRole="button" key={notice.id} onPress={() => openPost(notice.id)} style={styles.notice}>
                <MaterialCommunityIcons color={palette.green} name="pin" size={16} />
                <Text numberOfLines={1} style={styles.noticeBody}>{notice.title ?? notice.body}</Text>
                <MaterialCommunityIcons color={palette.muted} name="chevron-right" size={18} />
              </Pressable>
            ))}
          </View>
        ) : null}
        refreshControl={refreshControl}
        renderItem={renderPost}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}

const BoardPostRow = memo(function BoardPostRow({ author, commentCount, onOpen, post, reactions, unread }: { author?: Profile; commentCount: number; onOpen: (postId: string) => void; post: RoomPost; reactions: readonly RoomPostReaction[]; unread: boolean }) {
  const title = post.secretPurchase ? `${formatWon(post.secretPurchase.amount)} 뒷구매` : post.title ?? post.body;
  return (
    <Pressable accessibilityLabel={`${author?.nickname ?? "알 수 없음"}님의 글: ${title}`} accessibilityRole="button" onPress={() => onOpen(post.id)} style={({ pressed }) => [styles.postRow, pressed && styles.pressed]}>
      <PostThumbnail post={post} />
      <View style={styles.postCopy}>
        <Text style={styles.postMeta}><Text style={styles.category}>{post.category ?? "잡담"}</Text>{` · ${formatDay(post.createdAt)}`}</Text>
        <View style={styles.postTitleRow}><Text numberOfLines={1} style={styles.postTitle}>{title}</Text>{unread ? <Text style={styles.new}>NEW</Text> : null}</View>
        <Text style={styles.postFooter}>{`반응 ${reactions.length} · 댓글 ${commentCount}`}</Text>
      </View>
      <View style={styles.authorProfile}>
        <AnimalAvatar photoUri={author?.avatarUri} size={32} value={author?.avatar} />
        <Text numberOfLines={1} style={styles.authorNickname}>
          {author?.nickname ?? "알 수 없음"}
        </Text>
      </View>
    </Pressable>
  );
});

function PostThumbnail({ post }: { post: RoomPost }) {
  if (post.photoUri) return <Image accessibilityLabel="게시글 사진" contentFit="cover" source={{ uri: post.photoUri }} style={styles.thumbnail} />;
  const icon = post.category === "뒷구매" ? "shopping-outline" : post.category === "거지력" ? "piggy-bank-outline" : "chat-outline";
  return <View style={[styles.thumbnail, styles.thumbnailFallback]}><MaterialCommunityIcons color={palette.green} name={icon} size={24} /></View>;
}

function formatDay(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: 120 },
  writeButton: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center", borderWidth: 1, borderColor: palette.line, borderRadius: 21, backgroundColor: palette.paper },
  writeIcon: { transform: [{ translateX: 8 }] },
  noticeList: { marginBottom: spacing.lg },
  notice: { alignItems: "center", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: palette.rule },
  noticeBody: { flex: 1, color: palette.ink, fontFamily: fonts.hand, fontSize: 12 },
  postRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 88, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: palette.rule },
  pressed: { opacity: 0.72 },
  thumbnail: { width: 72, height: 72, borderRadius: radii.md, backgroundColor: palette.rule },
  thumbnailFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(47,113,93,0.08)" },
  postCopy: { flex: 1, minWidth: 0, alignSelf: "stretch", justifyContent: "center" },
  postMeta: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10 }, category: { color: palette.green, fontFamily: fonts.handBold, fontWeight: "700" },
  postTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 }, postTitle: { flex: 1, color: palette.ink, fontFamily: fonts.handBold, fontSize: 14, fontWeight: "700" }, new: { color: palette.stamp, fontFamily: fonts.handBold, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }, postFooter: { color: palette.muted, fontFamily: fonts.hand, fontSize: 10, marginTop: 6 },
  authorProfile: { alignItems: "center", gap: 3, width: 46 },
  authorNickname: { alignSelf: "stretch", color: palette.muted, fontFamily: fonts.hand, fontSize: 9, textAlign: "center" },
});
