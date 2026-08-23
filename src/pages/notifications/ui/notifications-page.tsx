import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { EmptyState } from "@/shared/ui/empty-state";
import { PageHeader } from "@/shared/ui/page-header";
import { ScreenFrame } from "@/shared/ui/screen";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import type { AppNotification } from "@/shared/api/types";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { useProfiles } from "@/entities/member/api/use-members";
import { useNotifications } from "@/entities/notification/api/use-notifications";
import { notificationDestination } from "../model/notification-destination";
import { formatDateLabel } from "@/shared/lib/format";

export function NotificationsPage() {
  const router = useRouter();
  const refreshControl = usePullToRefreshControl();
  const notifications = useNotifications();
  const actorIds = useMemo(
    () =>
      notifications.flatMap((notification) =>
        notification.actorId ? [notification.actorId] : [],
      ),
    [notifications],
  );
  const profilesById = useProfiles(actorIds);
  const { markAllNotificationsRead, markNotificationsRead } = useAppActions();
  const hasUnread = notifications.some((notification) => !notification.readAt);

  const openNotification = (notification: AppNotification) => {
    void (async () => {
      if (!notification.readAt) await markNotificationsRead([notification.id]);
      const destination = notificationDestination(notification);
      if (destination.type === "dismissTo") {
        router.dismissTo(destination.pathname);
        return;
      }
      router.push(
        (destination.params
          ? { pathname: destination.pathname, params: destination.params }
          : destination.pathname) as never,
      );
    })();
  };

  return (
    <ScreenFrame
      fixedHeader={
        <PageHeader
          bottomSpacing="md"
          onBack={() => router.back()}
          right={
            hasUnread ? (
              <Pressable
                accessibilityLabel="소식 모두 읽음 처리"
                accessibilityRole="button"
                onPress={() => void markAllNotificationsRead()}
                style={styles.readAllButton}
              >
                <Text style={styles.readAllText}>모두 읽음</Text>
              </Pressable>
            ) : undefined
          }
          title="소식함"
        />
      }
      testID="notifications-screen">
      <FlatList
        contentContainerStyle={styles.content}
        data={notifications}
        keyExtractor={(notification) => notification.id}
        ListEmptyComponent={
          <EmptyState
            description="새 지출과 방 공지, 내 지출에 달린 댓글·답글이 이곳에 도착해요."
            icon="bell-outline"
            title="아직 새 소식이 없어요."
          />
        }
        refreshControl={refreshControl}
        renderItem={({ item: notification }) => {
          const actor = notification.actorId
            ? profilesById.get(notification.actorId)
            : undefined;
          const copy = notificationCopy(notification, actor?.nickname);
          return (
            <Pressable
              accessibilityLabel={copy}
              accessibilityRole="button"
              onPress={() => openNotification(notification)}
              style={({ pressed }) => [
                styles.row,
                !notification.readAt && styles.unreadRow,
                pressed && styles.pressed,
              ]}
            >
              {actor ? (
                <AnimalAvatar
                  photoUri={actor.avatarUri}
                  size={42}
                  value={actor.avatar}
                />
              ) : (
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons
                    color={palette.green}
                    name="bell-outline"
                    size={21}
                  />
                </View>
              )}
              <View style={styles.copy}>
                <Text style={styles.message}>{copy}</Text>
                <Text style={styles.date}>{formatDateLabel(notification.createdAt)}</Text>
              </View>
              {!notification.readAt ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenFrame>
  );
}

function notificationCopy(notification: AppNotification, actorName?: string) {
  const actor = actorName ?? "멤버";
  switch (notification.kind) {
    case "expense_created":
      return `${actor}님이 새 지출을 기록했어요.`;
    case "expense_comment":
      return "내 지출에 새 댓글이 달렸어요.";
    case "comment_reply":
      return "내 댓글에 새 답글이 달렸어요.";
    case "member_joined":
      return `${actor}님이 방에 참여했어요.`;
    case "room_notice":
      return `${actor}님이 새 공지를 올렸어요.`;
    default:
      return "새 소식이 도착했어요.";
  }
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: 120 },
  readAllButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.paper,
    borderWidth: 1,
    borderColor: palette.line,
  },
  readAllText: { color: palette.green, fontFamily: fonts.handBold, fontSize: 12, fontWeight: "700" },
  row: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(52,49,40,0.12)",
  },
  unreadRow: { marginHorizontal: -spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: "rgba(47,113,93,0.06)" },
  pressed: { opacity: 0.7 },
  iconCircle: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  copy: { flex: 1, minWidth: 0 },
  message: { color: palette.ink, fontFamily: fonts.hand, fontSize: 14, lineHeight: 20 },
  date: { color: palette.muted, fontFamily: fonts.hand, fontSize: 11, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.coral },
});
