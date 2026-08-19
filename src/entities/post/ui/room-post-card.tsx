import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import type { Profile, RoomPost } from "@/shared/api/types";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";

type RoomPostCardProps = {
  author?: Profile;
  dateLabel?: string;
  footer?: ReactNode;
  onPress?: () => void;
  post: RoomPost;
  variant: "list" | "detail" | "preview";
};

/** 게시판·상세·홈 미리보기가 공유하는 공지/작성자/본문 카드 골격. */
export function RoomPostCard({
  author,
  dateLabel,
  footer,
  onPress,
  post,
  variant,
}: RoomPostCardProps) {
  const isNotice = post.kind === "NOTICE";
  const isPoll = post.kind === "POLL";
  const isPreview = variant === "preview";
  const content = (
    <>
      {isPreview && isNotice ? <NoticeBadge compact /> : null}
      {variant === "detail" && isNotice ? <NoticeBadge /> : null}
      {!isPreview || !isNotice ? (
        <View style={[
          styles.authorRow,
          isPreview && styles.previewAuthorRow,
          variant === "detail" && styles.detailAuthorRow,
        ]}>
          <AnimalAvatar
            photoUri={author?.avatarUri}
            size={isPreview ? 24 : variant === "detail" ? 42 : 40}
            value={author?.avatar}
          />
          {variant === "detail" ? (
            <View>
              <Text style={[styles.author, isPreview && styles.previewAuthor]}>
                {author?.nickname ?? "알 수 없음"}
              </Text>
              {dateLabel ? <Text style={styles.detailDate}>{dateLabel}</Text> : null}
            </View>
          ) : (
            <Text style={styles.author}>{author?.nickname ?? "알 수 없음"}</Text>
          )}
          {variant === "list" && dateLabel ? (
            <Text style={styles.listDate}>{dateLabel}</Text>
          ) : null}
        </View>
      ) : null}
      {variant === "list" && isNotice ? <NoticeBadge compact /> : null}
      {isPoll ? <PollBadge compact={isPreview || variant === "list"} /> : null}
      <Text
        numberOfLines={isPreview ? 2 : variant === "list" ? 3 : undefined}
        style={[
          styles.body,
          variant === "detail" && styles.detailBody,
          isPreview && styles.previewBody,
          isNotice && styles.noticeBody,
        ]}
      >
        {post.body}
      </Text>
      {footer}
    </>
  );

  const cardStyle = [
    styles.card,
    variant === "list" && styles.listCard,
    variant === "detail" && styles.detailCard,
    isPreview && styles.previewCard,
    isPreview && isNotice && styles.previewNoticeCard,
    isNotice && styles.noticeCard,
  ];
  if (!onPress) return <View style={cardStyle}>{content}</View>;

  return (
    <Pressable
      accessibilityLabel={`${author?.nickname ?? "알 수 없음"}님의 글: ${post.body}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function NoticeBadge({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.noticeBadge, compact && styles.compactNoticeBadge]}>
      <MaterialCommunityIcons color={palette.cream} name="pin" size={compact ? 12 : 14} />
      <Text style={[styles.noticeBadgeText, compact && styles.compactNoticeBadgeText]}>공지</Text>
    </View>
  );
}

function PollBadge({ compact }: { compact?: boolean }) {
  return (
    <View style={[styles.pollBadge, compact && styles.compactPollBadge]}>
      <Text style={[styles.pollBadgeText, compact && styles.compactPollBadgeText]}>투표글</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.rule,
    borderRadius: radii.xl,
    backgroundColor: palette.paper,
  },
  detailCard: { borderColor: palette.line },
  listCard: { marginBottom: spacing.lg },
  previewCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  previewNoticeCard: { marginBottom: spacing.sm },
  noticeCard: { borderColor: palette.lineStrong },
  pressed: { opacity: 0.78 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  previewAuthorRow: { gap: spacing.sm, marginBottom: spacing.sm },
  detailAuthorRow: { marginBottom: spacing.lg },
  author: { flex: 1, color: palette.ink, fontFamily: fonts.handBold, fontSize: 16, fontWeight: "700" },
  previewAuthor: { fontSize: 13 },
  listDate: { color: palette.muted, fontFamily: fonts.number, fontSize: 14 },
  detailDate: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: 3 },
  noticeBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: palette.green,
  },
  compactNoticeBadge: { marginBottom: spacing.sm, paddingVertical: 2 },
  noticeBadgeText: { color: palette.cream, fontFamily: fonts.handBold, fontSize: 13, fontWeight: "700" },
  compactNoticeBadgeText: { fontSize: 11 },
  pollBadge: {
    alignSelf: "flex-start",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(233,135,98,0.14)",
  },
  compactPollBadge: { marginBottom: spacing.sm, paddingVertical: 2 },
  pollBadgeText: { color: palette.coralText, fontFamily: fonts.handBold, fontSize: 13, fontWeight: "700" },
  compactPollBadgeText: { fontSize: 11 },
  body: { color: palette.ink, fontFamily: fonts.hand, fontSize: 18, lineHeight: 27 },
  previewBody: { fontSize: 15, lineHeight: 22 },
  detailBody: { lineHeight: 28, marginBottom: spacing.xl },
  noticeBody: { fontFamily: fonts.handBold },
});
