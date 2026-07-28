import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
  type SectionListRenderItemInfo,
} from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { PrimaryButton } from "@/components/ui/primary-button";
import { ScreenFrame } from "@/components/ui/screen";
import { SectionHeader } from "@/components/ui/section-header";
import { palette, radii, spacing } from "@/constants/design";
import type { OfflineMutationSummary } from "@/data/offline-queue-repository";
import { useAppActions } from "@/providers/app-actions-provider";
import {
  useAppDataMode,
  useCurrentUser,
  useHistory,
} from "@/providers/app-data-hooks";
import { useAppDialog } from "@/providers/app-dialog-provider";
import { useSession } from "@/providers/session-provider";
import { useSyncQueue } from "@/providers/sync-provider";
import {
  useNotificationPreferences,
  type NotificationPreferences,
} from "@/services/notification-preferences-store";
import { requestNotificationPermission } from "@/services/notification-service";

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
      type: "toggle";
      icon: keyof typeof MaterialCommunityIcons.glyphMap;
      label: string;
      value: boolean;
      onChange: (value: boolean) => void;
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

export default function ProfileScreen() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { pastPeriods } = useHistory();
  const dataMode = useAppDataMode();
  const { resetDemo } = useAppActions();
  const {
    discardOperation: discardSyncOperation,
    getCopyableError: getCopyableSyncError,
    operations: syncOperations,
    retryOperation: retrySyncOperation,
  } = useSyncQueue();
  const { showDialog } = useAppDialog();
  const { requiresAuth, signOut } = useSession();
  const {
    preferences: notifications,
    updatePreference,
  } = useNotificationPreferences();

  const updateNotifications = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      if (value && !(await requestNotificationPermission())) {
        showDialog(
          "알림 권한이 필요해요",
          "기기 설정에서 자린고비 알림을 허용해 주세요.",
        );
        return;
      }
      try {
        await updatePreference(key, value);
      } catch {
        showDialog(
          "알림 설정을 저장하지 못했어요",
          "잠시 후 다시 시도해 주세요.",
        );
      }
    },
    [showDialog, updatePreference],
  );

  const copySyncError = useCallback(
    async (operationId: string) => {
      const message = await getCopyableSyncError(operationId);
      if (!message) return;
      await Clipboard.setStringAsync(message);
      showDialog(
        "오류 내용을 복사했어요",
        "고객지원 문의에 붙여 넣어 주세요.",
      );
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

  const manageSyncOperation = useCallback((operation: OfflineMutationSummary) => {
    const failureMessage = operation.failure?.message ?? "연결이 복구되면 자동으로 다시 시도합니다.";
    if (operation.status === "PENDING") {
      showDialog("동기화 대기 중", failureMessage);
      return;
    }
    const retryAllowed = operation.failure?.code !== "CUTOFF_EXPIRED";
    const discardAction = {
      text: operation.failure?.code === "VERSION_CONFLICT" ? "서버 값 유지" : "작업 삭제",
      style: "destructive" as const,
      onPress: () => void runSyncAction(
        () => discardSyncOperation(operation.operationId),
        "작업을 삭제하지 못했어요",
      ),
    };
    if (!retryAllowed) {
      showDialog(syncOperationLabel(operation.kind), failureMessage, [
        { text: "취소", style: "cancel" },
        {
          text: "오류 복사",
          onPress: () => void runSyncAction(
            () => copySyncError(operation.operationId),
            "오류를 복사하지 못했어요",
          ),
        },
        discardAction,
      ]);
      return;
    }
    showDialog(
      syncOperationLabel(operation.kind),
      failureMessage,
      [
        { text: "취소", style: "cancel" },
        {
          text: "오류 복사",
          onPress: () => void runSyncAction(
            () => copySyncError(operation.operationId),
            "오류를 복사하지 못했어요",
          ),
        },
        {
          text: "해결 방법",
          onPress: () => showDialog(
            "동기화 실패 해결",
            operation.failure?.code === "VERSION_CONFLICT"
              ? "서버의 최신 값을 유지하거나 내 변경을 그 위에 다시 적용할 수 있어요."
              : "작업을 삭제하거나 같은 요청 ID로 다시 시도할 수 있어요.",
            [
              { text: "취소", style: "cancel" },
              discardAction,
              {
                text: operation.failure?.code === "VERSION_CONFLICT" ? "내 변경 재적용" : "다시 시도",
                onPress: () => void runSyncAction(
                  () => retrySyncOperation(operation.operationId),
                  "다시 시도하지 못했어요",
                ),
              },
            ],
          ),
        },
      ],
    );
  }, [
    copySyncError,
    discardSyncOperation,
    retrySyncOperation,
    runSyncAction,
    showDialog,
  ]);
  const sections = useMemo<ProfileSection[]>(() => [
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
      key: "notifications",
      title: "알림",
      data: [
        {
          key: "social-events",
          type: "toggle",
          icon: "message-reply-text-outline",
          label: "댓글·답글",
          value: notifications.socialEvents,
          onChange: (value) =>
            void updateNotifications("socialEvents", value),
        },
        {
          key: "period-events",
          type: "toggle",
          icon: "bell-outline",
          label: "시작·보정·정산",
          value: notifications.periodEvents,
          onChange: (value) =>
            void updateNotifications("periodEvents", value),
        },
      ],
    },
    {
      key: "safety",
      title: "안전과 데이터",
      data: [
        {
          key: "block-report",
          type: "setting",
          icon: "shield-check-outline",
          label: "차단·신고 관리",
          onPress: () =>
            showDialog(
              "준비된 정책",
              "차단한 멤버의 금액은 유지하고 사진·댓글만 흐림 처리합니다.",
            ),
        },
        {
          key: "privacy",
          type: "setting",
          icon: "file-document-outline",
          label: "개인정보 및 보관 정책",
          onPress: () =>
            showDialog(
              "보관 정책",
              "완료 기록은 읽기 전용으로 보관하며 삭제 요청 시 콘텐츠를 비식별화합니다.",
            ),
        },
      ],
    },
    ...(requiresAuth
      ? [
          {
            key: "account",
            title: "계정",
            data: [
              {
                key: "sign-out",
                type: "setting" as const,
                icon: "logout" as const,
                label: "로그아웃",
                onPress: confirmSignOut,
              },
            ],
          },
        ]
      : []),
  ], [
    confirmSignOut,
    notifications.periodEvents,
    notifications.socialEvents,
    pastPeriods.length,
    requiresAuth,
    router,
    showDialog,
    syncOperations,
    updateNotifications,
  ]);
  const renderProfileItem = useCallback(
    ({
      item,
    }: SectionListRenderItemInfo<ProfileListItem, ProfileSection>) => {
      if (item.type === "sync") {
        return (
          <SyncOperationRow
            onPress={manageSyncOperation}
            operation={item.operation}
          />
        );
      }
      if (item.type === "toggle") {
        return (
          <ToggleRow
            icon={item.icon}
            label={item.label}
            onChange={item.onChange}
            value={item.value}
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
        contentContainerStyle={styles.content}
        keyExtractor={(item) => item.key}
        ListFooterComponent={
          dataMode === "demo" ? (
            <View style={styles.resetSection}>
              <PrimaryButton
                label="데모 데이터 초기화"
                onPress={() =>
                  showDialog(
                    "초기화할까요?",
                    "앱의 로컬 데모 기록을 처음 상태로 되돌립니다.",
                    [
                      { text: "취소", style: "cancel" },
                      {
                        text: "초기화",
                        style: "destructive",
                        onPress: () => void resetDemo(),
                      },
                    ],
                  )
                }
                variant="secondary"
              />
            </View>
          ) : null
        }
        ListHeaderComponent={
          <>
            <Text style={styles.title}>내 정보</Text>
            <GlassSurface style={styles.profileCard}>
              <Text style={styles.avatar}>{currentUser?.avatar ?? "🙂"}</Text>
              <Text style={styles.name}>
                {currentUser?.nickname ?? "사용자"}
              </Text>
            </GlassSurface>
          </>
        }
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
        color={
          operation.status === "FAILED" ? palette.danger : palette.green
        }
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

const ToggleRow = memo(function ToggleRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons color={palette.green} name={icon} size={21} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={palette.cream}
        trackColor={{ false: palette.line, true: palette.green }}
        value={value}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  title: {
    color: palette.ink,
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
  avatar: { fontSize: 42 },
  name: {
    flex: 1,
    minWidth: 0,
    color: palette.ink,
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
  rowLabel: { flex: 1, color: palette.ink, fontSize: 14 },
  rowValue: { color: palette.muted, fontSize: 13 },
  syncText: { flex: 1, gap: 3 },
  syncStatus: { color: palette.muted, fontSize: 12 },
  resetSection: { marginTop: spacing.xxl },
});
