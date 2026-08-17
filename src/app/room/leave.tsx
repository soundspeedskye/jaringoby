import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { EmptyState } from "@/shared/ui/empty-state";
import { FormMessage } from "@/shared/ui/form-message";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import {
  useActiveRoom,
  useActiveRoomMembers,
  useCurrentUser,
} from "@/shared/providers/app-data-hooks";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";

type LeaveMode = "leave" | "switch";

export default function LeaveRoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string;
    joinCode?: string;
    targetName?: string;
  }>();
  const mode: LeaveMode = params.mode === "switch" ? "switch" : "leave";
  const joinCode = typeof params.joinCode === "string" ? params.joinCode : "";
  const targetName =
    typeof params.targetName === "string" ? params.targetName : "";

  const activeRoom = useActiveRoom();
  const currentUser = useCurrentUser();
  const members = useActiveRoomMembers(activeRoom?.id);
  const { leaveRoom, switchRoom, closeRoom } = useAppActions();
  const { showDialog } = useAppDialog();

  const [successorId, setSuccessorId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const goHome = useCallback(() => router.replace("/"), [router]);

  const isOwner = Boolean(
    activeRoom && currentUser && activeRoom.ownerId === currentUser.id,
  );
  const otherMembers = members.filter((member) => !member.isCurrentUser);
  const soloOwner = isOwner && otherMembers.length === 0;
  const needsSuccessor = isOwner && otherMembers.length > 0;

  const submit = useCallback(async () => {
    if (!activeRoom) return;
    if (needsSuccessor && !successorId) {
      setMessage("방장을 넘길 참여자를 선택해 주세요.");
      return;
    }
    setMessage(null);
    setSubmitting(true);
    try {
      const successor = needsSuccessor ? (successorId ?? undefined) : undefined;
      if (mode === "switch") {
        await switchRoom({
          leaveRoomId: activeRoom.id,
          successorId: successor,
          joinCode,
        });
      } else {
        await leaveRoom(activeRoom.id, successor);
      }
      goHome();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : mode === "switch"
            ? "방을 옮기지 못했어요."
            : "방을 나가지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    activeRoom,
    goHome,
    joinCode,
    leaveRoom,
    mode,
    needsSuccessor,
    successorId,
    switchRoom,
  ]);

  const closeSoloRoom = useCallback(() => {
    if (!activeRoom) return;
    showDialog(
      "방 닫기",
      "혼자 남은 이 방을 닫으면 지난 방 목록으로 옮겨지고, 다시 열 수 없어요. 계속할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "방 닫기",
          style: "destructive",
          onPress: () =>
            void (async () => {
              setMessage(null);
              setSubmitting(true);
              try {
                await closeRoom(activeRoom.id);
                goHome();
              } catch (reason) {
                setMessage(
                  reason instanceof Error ? reason.message : "방을 닫지 못했어요.",
                );
              } finally {
                setSubmitting(false);
              }
            })(),
        },
      ],
    );
  }, [activeRoom, closeRoom, goHome, showDialog]);

  const title = mode === "switch" ? "방 옮기기" : "방 나가기";

  if (!activeRoom || !currentUser) {
    return (
      <ModalFormScreen
        headerBottomSpacing="md"
        onBack={goHome}
        testID="leave-room-screen"
        title={title}
      >
        <EmptyState
          description="현재 참여 중인 방이 없어요."
          icon="door-open"
          title="나갈 방이 없어요."
          variant="preview"
        />
      </ModalFormScreen>
    );
  }

  return (
    <ModalFormScreen
      headerBottomSpacing="md"
      onBack={goHome}
      testID="leave-room-screen"
      title={title}
    >
      <GlassSurface style={styles.summary}>
        <Text style={styles.summaryLabel}>
          {mode === "switch" ? "지금 참여 중" : "나갈 방"}
        </Text>
        <Text style={styles.roomName}>{activeRoom.name}</Text>
        {mode === "switch" ? (
          <>
            <View style={styles.switchArrow}>
              <MaterialCommunityIcons
                color={palette.muted}
                name="arrow-down"
                size={20}
              />
            </View>
            <Text style={styles.summaryLabel}>옮겨갈 방</Text>
            <Text style={styles.roomName}>{targetName || joinCode}</Text>
          </>
        ) : null}
      </GlassSurface>

      <NoticeBanner icon="alert-outline" style={styles.warning} tone="danger">
        나가면 이 방에는 다시 들어올 수 없습니다.
      </NoticeBanner>

      {soloOwner ? (
        <View style={styles.soloSection}>
          <NoticeBanner icon="information-outline" tone="warning">
            혼자 남은 방이에요. 방을 닫으면 지난 방 목록으로 옮겨지고 다시 열 수
            없어요.
          </NoticeBanner>
          <PrimaryButton
            label="방 닫기"
            loading={submitting}
            onPress={closeSoloRoom}
            style={styles.submitButton}
            variant="danger"
          />
        </View>
      ) : null}

      {needsSuccessor ? (
        <View style={styles.successorSection}>
          <Text style={styles.successorTitle}>새 방장 선택</Text>
          <View style={styles.successorList}>
            {otherMembers.map((member) => {
              const selected = successorId === member.userId;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  key={member.userId}
                  onPress={() => setSuccessorId(member.userId)}
                  style={[
                    styles.successorRow,
                    selected && styles.successorRowOn,
                  ]}
                >
                  <AnimalAvatar photoUri={member.avatarUri} size={36} value={member.avatar} />
                  <Text style={styles.successorName}>{member.nickname}</Text>
                  <MaterialCommunityIcons
                    color={selected ? palette.green : palette.line}
                    name={selected ? "check-circle" : "circle-outline"}
                    size={22}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <FormMessage message={message} style={styles.message} />

      {!soloOwner ? (
        <PrimaryButton
          disabled={needsSuccessor && !successorId}
          label={mode === "switch" ? "나가고 새 방 참여" : "방 나가기"}
          loading={submitting}
          onPress={() => void submit()}
          style={styles.submitButton}
          variant="danger"
        />
      ) : null}
    </ModalFormScreen>
  );
}

const styles = StyleSheet.create({
  summary: {
    padding: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: palette.paper,
  },
  summaryLabel: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
  roomName: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 3,
  },
  switchArrow: { alignItems: "flex-start", marginVertical: spacing.sm },
  warning: { marginBottom: spacing.md },
  soloSection: { gap: spacing.md },
  successorSection: { marginTop: spacing.lg },
  successorTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: spacing.sm,
  },
  successorList: { gap: spacing.sm },
  successorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
  },
  successorRowOn: {
    borderColor: palette.green,
    backgroundColor: "rgba(74,124,89,0.08)",
  },
  successorName: {
    flex: 1,
    color: palette.ink,
    fontFamily: fonts.hand,
    fontSize: 15,
    fontWeight: "600",
  },
  message: { marginVertical: spacing.md },
  submitButton: { marginTop: spacing.md },
});
