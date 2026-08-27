import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";

import type { Profile, RoomPost } from "@/shared/api/types";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { formatDateLabel, formatWon } from "@/shared/lib/format";
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
  const showCategoryAtTop = variant === "detail" && !isNotice;
  const postLabel = isPoll ? "투표" : post.category;
  const content = (
    <>
      {/* 공지는 "고정된 중요 글"이라 눈에 띄는 알약으로 카드 맨 위에 세운다. */}
      {isNotice ? <NoticeBadge compact={variant !== "detail"} /> : null}
      {/* 투표는 카테고리를 갖지 않고, 글 종류만 뱃지로 보여 준다. */}
      {showCategoryAtTop && postLabel ? (
        <View style={styles.categoryRow}>
          <Text style={styles.categoryLabel}>{postLabel}</Text>
          {post.secretPurchase ? (
            <Text style={styles.secretMeta}>{`${post.secretPurchase.expenseCategory} · ${formatDateLabel(post.secretPurchase.occurredAt)}`}</Text>
          ) : null}
        </View>
      ) : null}
      {variant !== "detail" && (!isPreview || !isNotice) ? (
        <View style={[
          styles.authorRow,
          isPreview && styles.previewAuthorRow,
        ]}>
          <AnimalAvatar
            photoUri={author?.avatarUri}
            size={isPreview ? 24 : 40}
            value={author?.avatar}
          />
          <Text style={styles.author}>{author?.nickname ?? "알 수 없음"}</Text>
          {variant === "list" && dateLabel ? (
            <Text style={styles.listDate}>{dateLabel}</Text>
          ) : null}
        </View>
      ) : null}
      {post.title ? (
        <Text style={[
          styles.title,
          variant === "detail" && styles.detailTitle,
        ]}>
          {post.secretPurchase ? `${formatWon(post.secretPurchase.amount)} 뒷구매` : post.title}
        </Text>
      ) : null}
      {variant === "detail" ? (
        <>
          {dateLabel ? <Text style={styles.detailDate}>{dateLabel}</Text> : null}
          <View style={styles.detailAuthorRow}>
            <AnimalAvatar
              photoUri={author?.avatarUri}
              size={40}
              value={author?.avatar}
            />
            <Text numberOfLines={1} style={styles.detailAuthor}>
              {author?.nickname ?? "알 수 없음"}
            </Text>
          </View>
          <View style={styles.detailDivider} />
        </>
      ) : null}
      {post.photoUri ? (
        <Image
          accessibilityLabel="게시글 첨부 사진"
          contentFit="cover"
          source={{ uri: post.photoUri }}
          style={[styles.photo, variant === "detail" && styles.detailPhoto]}
        />
      ) : null}
      <Text
        numberOfLines={isPreview ? 2 : variant === "list" ? 3 : undefined}
        style={[
          styles.body,
          variant === "detail" && styles.detailBody,
          isPreview && styles.previewBody,
          // 상세 공지도 일반 글과 같은 본문 폰트로 읽는다.
          // 목록·미리보기에서만 공지를 조금 더 또렷하게 보이게 한다.
          isNotice && variant !== "detail" && styles.noticeBody,
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

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.rule,
    borderRadius: radii.xl,
    backgroundColor: palette.paper,
  },
  // 상세 글은 카드 표면을 걷어내고 화면 배경 위에 바로 놓는다.
  // 내부 콘텐츠 구조와 공지 배지는 그대로 재사용한다.
  detailCard: {
    paddingHorizontal: 0,
    paddingVertical: spacing.lg,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
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
  detailAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  author: { flex: 1, color: palette.ink, fontFamily: fonts.handBold, fontSize: 16, fontWeight: "700" },
  previewAuthor: { fontSize: 13 },
  listDate: { color: palette.muted, fontFamily: fonts.number, fontSize: 14 },
  detailDate: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12, lineHeight: 18 },
  detailAuthor: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 13, fontWeight: "700", maxWidth: "60%" },
  detailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.rule, marginBottom: spacing.xl },
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
  body: { color: palette.ink, fontFamily: fonts.hand, fontSize: 18, lineHeight: 27 },
  title: { color: palette.ink, fontFamily: fonts.handBold, fontSize: 19, fontWeight: "700", lineHeight: 27, marginBottom: spacing.sm },
  detailTitle: { fontFamily: fonts.hand, fontSize: 18, fontWeight: "400", lineHeight: 27, marginBottom: spacing.sm },
  previewBody: { fontSize: 15, lineHeight: 22 },
  detailBody: { fontSize: 15, lineHeight: 24, marginBottom: spacing.xl },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  categoryLabel: { overflow: "hidden", color: palette.green, fontFamily: fonts.handBold, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: "rgba(47,113,93,0.08)" },
  secretMeta: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11 },
  photo: { width: "100%", aspectRatio: 16 / 10, borderRadius: radii.lg, backgroundColor: palette.line, marginBottom: spacing.md },
  detailPhoto: { marginBottom: spacing.sm },
  noticeBody: { fontFamily: fonts.handBold },
});
