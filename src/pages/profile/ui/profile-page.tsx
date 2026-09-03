import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";

import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { ScreenFrame } from "@/shared/ui/screen";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { useTabBarClearance } from "@/shared/lib/use-tab-bar-clearance";
import { SectionHeader } from "@/shared/ui/section-header";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import type { OfflineMutationSummary } from "@/shared/api/offline-queue-repository";
import { useCurrentUser } from "@/entities/member/api/use-members";
import { useHistory } from "@/entities/period/api/use-periods";
import { useActiveRoom, useClosedRooms } from "@/entities/room/api/use-rooms";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { useSession } from "@/shared/providers/session-provider";
import { useSyncQueue } from "@/shared/providers/sync-provider";
import { formatWon } from "@/shared/lib/format";

type ProfileListItem =
  | {
      key: string;
      type: "setting";
      icon: keyof typeof MaterialCommunityIcons.glyphMap;
      label: string;
      value?: string;
      onPress: () => void;
    }
  | {
      key: string;
      type: "room-summary";
      name: string;
      memberCount: number;
      baseAmount: number;
    }
  | {
      key: string;
      type: "sync";
      operation: OfflineMutationSummary;
    };

type ProfileSection = {
  key: string;
  title: string;
  data: ProfileListItem[];
};

export function ProfilePage() {
  const router = useRouter();
  const tabBarClearance = useTabBarClearance();
  const refreshControl = usePullToRefreshControl();
  const currentUser = useCurrentUser();
  const activeRoom = useActiveRoom();
  const closedRooms = useClosedRooms();
  const { pastPeriods } = useHistory();
  const {
    discardOperation: discardSyncOperation,
    getCopyableError: getCopyableSyncError,
    operations: syncOperations,
    retryOperation: retrySyncOperation,
  } = useSyncQueue();
  const { showDialog } = useAppDialog();
  const { signOut } = useSession();
  const copySyncError = useCallback(
    async (operationId: string) => {
      const message = await getCopyableSyncError(operationId);
      if (!message) return;
      await Clipboard.setStringAsync(message);
      showDialog("오류 내용을 복사했어요", "고객지원 문의에 붙여 넣어 주세요.");
    },
    [getCopyableSyncError, showDialog],
  );

  const runSyncAction = useCallback(
    async (action: () => Promise<void>, fallback: string) => {
      try {
        await action();
      } catch (reason) {
        showDialog(
          fallback,
          reason instanceof Error
            ? reason.message
            : "동기화 작업을 처리하지 못했어요.",
        );
      }
    },
    [showDialog],
  );

  const confirmSignOut = useCallback(() => {
    const pending = syncOperations.length;
    showDialog(
      "로그아웃할까요?",
      pending > 0
        ? `아직 서버에 반영되지 않은 작업 ${pending}건이 이 기기에 남아 있어요. 다시 로그인하면 이어서 시도하지만, 보정 마감이 지나면 결과에 반영되지 않아요.`
        : "이 기기에서만 로그아웃해요. 기록은 서버에 그대로 남아 있어요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "로그아웃",
          style: "destructive",
          onPress: () =>
            void signOut().catch((reason: unknown) => {
              showDialog(
                "로그아웃하지 못했어요",
                reason instanceof Error
                  ? reason.message
                  : "잠시 후 다시 시도해 주세요.",
              );
            }),
        },
      ],
    );
  }, [showDialog, signOut, syncOperations.length]);

  const manageSyncOperation = useCallback(
    (operation: OfflineMutationSummary) => {
      const failureMessage =
        operation.failure?.message ??
        "연결이 복구되면 자동으로 다시 시도합니다.";
      if (operation.status === "PENDING") {
        showDialog("동기화 대기 중", failureMessage);
        return;
      }
      const retryAllowed = operation.failure?.code !== "CUTOFF_EXPIRED";
      const discardAction = {
        text:
          operation.failure?.code === "VERSION_CONFLICT"
            ? "서버 값 유지"
            : "작업 삭제",
        style: "destructive" as const,
        onPress: () =>
          void runSyncAction(
            () => discardSyncOperation(operation.operationId),
            "작업을 삭제하지 못했어요",
          ),
      };
      if (!retryAllowed) {
        showDialog(syncOperationLabel(operation.kind), failureMessage, [
          { text: "취소", style: "cancel" },
          {
            text: "오류 복사",
            onPress: () =>
              void runSyncAction(
                () => copySyncError(operation.operationId),
                "오류를 복사하지 못했어요",
              ),
          },
          discardAction,
        ]);
        return;
      }
      showDialog(syncOperationLabel(operation.kind), failureMessage, [
        { text: "취소", style: "cancel" },
        {
          text: "오류 복사",
          onPress: () =>
            void runSyncAction(
              () => copySyncError(operation.operationId),
              "오류를 복사하지 못했어요",
            ),
        },
        {
          text: "해결 방법",
          onPress: () =>
            showDialog(
              "동기화 실패 해결",
              operation.failure?.code === "VERSION_CONFLICT"
                ? "서버의 최신 값을 유지하거나 내 변경을 그 위에 다시 적용할 수 있어요."
                : "작업을 삭제하거나 같은 요청 ID로 다시 시도할 수 있어요.",
              [
                { text: "취소", style: "cancel" },
                discardAction,
                {
                  text:
                    operation.failure?.code === "VERSION_CONFLICT"
                      ? "내 변경 재적용"
                      : "다시 시도",
                  onPress: () =>
                    void runSyncAction(
                      () => retrySyncOperation(operation.operationId),
                      "다시 시도하지 못했어요",
                    ),
                },
              ],
            ),
        },
      ]);
    },
    [
      copySyncError,
      discardSyncOperation,
      retrySyncOperation,
      runSyncAction,
      showDialog,
    ],
  );
  const sections = useMemo<ProfileSection[]>(
    () => [
      {
        key: "history",
        title: "기록",
        data: [
          {
            key: "history",
            type: "setting",
            icon: "archive-outline",
            label: "지난 주차",
            value: `${pastPeriods.length}개`,
            onPress: () => router.push("/history"),
          },
        ],
      },
      ...(activeRoom
        ? [
            {
              key: "room",
              title: "현재 방",
              data: [
                {
                  key: "current-room",
                  type: "setting" as const,
                  icon: "door-open" as const,
                  label: activeRoom.name,
                  onPress: () => router.push("/room/leave"),
                },
              ],
            },
          ]
        : []),
      ...(closedRooms.length
        ? [
            {
              key: "past-rooms",
              title: "지난 방",
              data: closedRooms.map(
                (room): ProfileListItem => ({
                  key: `closed-${room.id}`,
                  type: "room-summary",
                  name: room.name,
                  memberCount: room.memberCount,
                  baseAmount: room.baseAmount,
                }),
              ),
            },
          ]
        : []),
      ...(syncOperations.length
        ? [
            {
              key: "sync",
              title: "동기화",
              data: syncOperations.map(
                (operation): ProfileListItem => ({
                  key: operation.operationId,
                  type: "sync",
                  operation,
                }),
              ),
            },
          ]
        : []),
      {
        key: "account",
        title: "계정",
        data: [
          {
            key: "delete-account",
            type: "setting" as const,
            icon: "account-remove-outline" as const,
            label: "계정 탈퇴",
            onPress: () => router.push("/account/delete" as never),
          },
          {
            key: "sign-out",
            type: "setting" as const,
            icon: "logout" as const,
            label: "로그아웃",
            onPress: confirmSignOut,
          },
        ],
      },
    ],
    [
      activeRoom,
      closedRooms,
      confirmSignOut,
      pastPeriods.length,
      router,
      syncOperations,
    ],
  );
  const renderProfileItem = useCallback(
    ({ item }: SectionListRenderItemInfo<ProfileListItem, ProfileSection>) => {
      if (item.type === "sync") {
        return (
          <SyncOperationRow
            onPress={manageSyncOperation}
            operation={item.operation}
          />
        );
      }
      if (item.type === "room-summary") {
        return (
          <RoomSummaryRow
            baseAmount={item.baseAmount}
            memberCount={item.memberCount}
            name={item.name}
          />
        );
      }
      return (
        <SettingRow
          icon={item.icon}
          label={item.label}
          onPress={item.onPress}
          value={item.value}
        />
      );
    },
    [manageSyncOperation],
  );
  const renderProfileSectionHeader = useCallback(
    ({ section }: { section: ProfileSection }) => (
      <SectionHeader
        style={styles.sectionHeader}
        title={section.title}
        variant="form"
      />
    ),
    [],
  );

  return (
    <ScreenFrame testID="profile-screen">
      <SectionList
        contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>내 정보</Text>
            <Pressable accessibilityHint="프로필 사진과 닉네임을 변경합니다" accessibilityRole="button" onPress={() => router.push('/profile/edit' as never)}>
            <GlassSurface style={styles.profileCard}>
              <AnimalAvatar
                photoUri={currentUser?.avatarUri}
                value={currentUser?.avatar}
                size={72}
                style={styles.avatar}
              />
              <Text style={styles.name}>
                {currentUser?.nickname ?? "사용자"}
              </Text>
              <MaterialCommunityIcons color={palette.muted} name="chevron-right" size={22} />
            </GlassSurface>
            </Pressable>
          </>
        }
        refreshControl={refreshControl}
        renderItem={renderProfileItem}
        renderSectionHeader={renderProfileSectionHeader}
        sections={sections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </ScreenFrame>
  );
}

const SyncOperationRow = memo(function SyncOperationRow({
  onPress,
  operation,
}: {
  onPress: (operation: OfflineMutationSummary) => void;
  operation: OfflineMutationSummary;
}) {
  return (
    <Pressable
      accessibilityHint="동기화 실패 이유와 해결 방법을 확인합니다"
      accessibilityRole="button"
      onPress={() => onPress(operation)}
      style={styles.row}
      testID={`sync-operation-${operation.operationId}`}
    >
      <MaterialCommunityIcons
        color={operation.status === "FAILED" ? palette.danger : palette.green}
        name={
          operation.status === "FAILED"
            ? "cloud-alert-outline"
            : "cloud-sync-outline"
        }
        size={21}
      />
      <View style={styles.syncText}>
        <Text style={styles.rowLabel}>
          {syncOperationLabel(operation.kind)}
        </Text>
        <Text style={styles.syncStatus}>
          {operation.status === "FAILED"
            ? "동기화 실패 · 눌러서 해결"
            : "동기화 대기"}
        </Text>
      </View>
      <MaterialCommunityIcons
        color={palette.muted}
        name="chevron-right"
        size={20}
      />
    </Pressable>
  );
});

function syncOperationLabel(kind: OfflineMutationSummary["kind"]): string {
  const labels = {
    ADD_EXPENSE: "지출 등록",
    UPDATE_EXPENSE: "지출 수정",
    DELETE_EXPENSE: "지출 삭제",
    ADD_COMMENT: "댓글 등록",
    UPDATE_COMMENT: "댓글 수정",
    DELETE_COMMENT: "댓글 삭제",
  } as const;
  return labels[kind];
}

const RoomSummaryRow = memo(function RoomSummaryRow({
  name,
  memberCount,
  baseAmount,
}: {
  name: string;
  memberCount: number;
  baseAmount: number;
}) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        color={palette.muted}
        name="door-closed"
        size={21}
      />
      <Text numberOfLines={1} style={styles.rowLabel}>
        {name}
      </Text>
      <Text style={styles.rowValue}>
        멤버 {memberCount}명 · {formatWon(baseAmount)}
      </Text>
    </View>
  );
});

const SettingRow = memo(function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <MaterialCommunityIcons color={palette.green} name={icon} size={21} />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <MaterialCommunityIcons
        color={palette.muted}
        name="chevron-right"
        size={20}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
  title: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 30,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: spacing.xl,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.lg,
  },
  avatar: { marginBottom: spacing.sm },
  name: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 20,
    fontWeight: "700",
  },
  sectionHeader: {
    marginTop: spacing.xxl,
    marginBottom: spacing.sm,
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  rowLabel: {
    flex: 1,
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 14,
  },
  rowValue: { color: palette.muted, fontFamily: fonts.hand, fontSize: 13 },
  syncText: { flex: 1, gap: 3 },
  syncStatus: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
});
