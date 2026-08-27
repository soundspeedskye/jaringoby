import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useProfiles } from "@/entities/member/api/use-members";
import {
  useLatestRoomNotice,
  useRoomPosts,
} from "@/entities/post/api/use-posts";
import type { RoomPost } from "@/shared/api/types";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";

const BOARD_NAME = "아껴씀 청년방";

/** 홈에서 방의 최신 이야기와 공지를 가볍게 발견시키는 읽기 전용 진입 카드. */
export const RoomBoardPreview = memo(function RoomBoardPreview({
  roomId,
}: {
  roomId: string;
}) {
  const router = useRouter();
  const posts = useRoomPosts(roomId);
  const notice = useLatestRoomNotice(roomId);
  const latestPost = useMemo(
    () => posts.find((post) => post.kind === "POST"),
    [posts],
  );
  const latestPoll = useMemo(
    () => posts.find((post) => post.kind === "POLL"),
    [posts],
  );
  const shownPosts = useMemo(
    () =>
      [notice, latestPost, latestPoll].filter((post): post is RoomPost =>
        Boolean(post),
      ),
    [latestPoll, latestPost, notice],
  );
  const shownPostAuthorIds = useMemo(
    () => shownPosts.map((post) => post.authorId),
    [shownPosts],
  );
  const profiles = useProfiles(shownPostAuthorIds);
  const openBoard = useCallback(() => router.push("/community"), [router]);

  return (
    <Pressable
      accessibilityHint="훈화방 글 목록을 열어요"
      accessibilityLabel={
        shownPosts.length
          ? `${BOARD_NAME}, 최신 이야기 보기`
          : `${BOARD_NAME}, 첫 아낌 기록 남기기`
      }
      accessibilityRole="button"
      onPress={openBoard}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      testID="room-board-preview"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons
            color={palette.green}
            name="chat-outline"
            size={20}
          />
          <Text accessibilityRole="header" style={styles.title}>
            {BOARD_NAME}
          </Text>
        </View>
        <MaterialCommunityIcons
          color={palette.green}
          name="chevron-right"
          size={22}
        />
      </View>

      {shownPosts.length ? (
        <View style={styles.rows}>
          {shownPosts.map((post, index) => {
            const author = profiles.get(post.authorId);
            const label =
              post.kind === "NOTICE"
                ? "공지"
                : post.kind === "POLL"
                  ? "투표글"
                  : "최신글";
            return (
              <View
                key={post.id}
                style={[styles.row, index > 0 && styles.rowDivider]}
              >
                <View
                  style={[
                    styles.label,
                    post.kind === "NOTICE" && styles.noticeLabel,
                    post.kind === "POLL" && styles.pollLabel,
                    post.kind === "POST" && styles.latestLabel,
                  ]}
                >
                  <Text
                    style={[
                      styles.labelText,
                      post.kind === "NOTICE" && styles.noticeLabelText,
                      post.kind === "POLL" && styles.pollLabelText,
                      post.kind === "POST" && styles.latestLabelText,
                    ]}
                  >
                    {label}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {post.body}
                </Text>
                {post.kind === "NOTICE" ? null : (
                  <AnimalAvatar
                    photoUri={author?.avatarUri}
                    size={28}
                    value={author?.avatar}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            우리 방의 첫 아낌 기록을 남겨주세요
          </Text>
          <Text style={styles.emptyBody}>
            가볍게 오늘의 절약 이야기를 나눠봐요.
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.xl,
    backgroundColor: palette.cream,
  },
  pressed: { opacity: 0.82 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 19,
    fontWeight: "700",
  },
  rows: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  row: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.rule,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 13,
    fontWeight: "600",
  },
  label: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  labelText: { fontFamily: fonts.handBold, fontSize: 10, fontWeight: "700" },
  noticeLabel: { backgroundColor: palette.green },
  noticeLabelText: { color: palette.cream },
  latestLabel: { backgroundColor: "rgba(47,113,93,0.10)" },
  latestLabelText: { color: palette.green },
  pollLabel: { backgroundColor: "rgba(233,135,98,0.14)" },
  pollLabelText: { color: palette.coralText },
  empty: {
    minHeight: 82,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  emptyTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 15,
    fontWeight: "700",
  },
  emptyBody: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    marginTop: 5,
  },
});
