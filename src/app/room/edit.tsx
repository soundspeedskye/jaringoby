import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ModalFormScreen } from "@/components/layout/modal-form-screen";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { GlassSurface } from "@/components/ui/glass-surface";
import { KeyValueRow } from "@/components/ui/key-value-row";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PrimaryButton } from "@/components/ui/primary-button";
import { fonts, palette, spacing } from "@/constants/design";
import {
  DEFAULT_MAX_ACTIVE_MEMBERS,
  isValidRoomCapacity,
  isValidRoomName,
  ROOM_NAME_MAX_CHARACTERS,
} from "@/domain";
import {
  useActiveRoom,
  useActiveRoomMembers,
  useCurrentUser,
} from "@/providers/app-data-hooks";
import { useAppActions } from "@/providers/app-actions-provider";
import { formatWon } from "@/utils/format";
import type { Room } from "@/data/types";

export default function EditRoomScreen() {
  const router = useRouter();
  const activeRoom = useActiveRoom();
  const currentUser = useCurrentUser();
  const members = useActiveRoomMembers(activeRoom?.id);
  const isOwner = Boolean(activeRoom && currentUser && activeRoom.ownerId === currentUser.id);

  if (!activeRoom || !currentUser) {
    return (
      <ModalFormScreen onBack={() => router.replace("/")} title="방 설정">
        <EmptyState
          description="현재 참여 중인 방을 먼저 선택해 주세요."
          icon="cog-outline"
          title="설정할 방이 없어요."
          variant="preview"
        />
      </ModalFormScreen>
    );
  }

  if (!isOwner) {
    return (
      <ModalFormScreen onBack={() => router.back()} title="방 설정">
        <EmptyState
          description="방장만 방 이름과 정원을 바꿀 수 있어요."
          icon="shield-lock-outline"
          title="방 설정을 수정할 수 없어요."
          variant="preview"
        />
      </ModalFormScreen>
    );
  }

  return <EditRoomForm activeRoom={activeRoom} memberCount={members.length} />;
}

function EditRoomForm({
  activeRoom,
  memberCount,
}: {
  activeRoom: Room;
  memberCount: number;
}) {
  const router = useRouter();
  const { updateRoomSettings } = useAppActions();
  const [name, setName] = useState(activeRoom.name);
  const [capacityText, setCapacityText] = useState(String(activeRoom.capacity));
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const capacity = Number(capacityText);
  const validationError = useMemo(
    () => validate({ name, capacity, currentCapacity: activeRoom.capacity }),
    [activeRoom.capacity, capacity, name],
  );
  const hasChanges =
    name.trim() !== activeRoom.name || capacity !== activeRoom.capacity;

  const submit = async () => {
    const error = validate({ name, capacity, currentCapacity: activeRoom.capacity });
    if (error) {
      setFormError(error);
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await updateRoomSettings({
        roomId: activeRoom.id,
        name: name.trim(),
        capacity,
      });
      router.back();
    } catch (reason) {
      setFormError(
        reason instanceof Error ? reason.message : "방 설정을 저장하지 못했어요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalFormScreen
      footer={
        <PrimaryButton
          disabled={!hasChanges || Boolean(validationError)}
          label="저장하기"
          loading={submitting}
          onPress={() => void submit()}
        />
      }
      onBack={() => router.back()}
      testID="edit-room-screen"
      title="방 설정"
    >
      <Field
        autoFocus
        label="방 이름"
        maxLength={ROOM_NAME_MAX_CHARACTERS}
        onChangeText={setName}
        placeholder="예: 평일 5만원 지키기"
        value={name}
      />

      <View style={styles.capacityBlock}>
        <Field
          hint={`현재 ${activeRoom.capacity}명 · 최대 ${DEFAULT_MAX_ACTIVE_MEMBERS}명 · 정원은 늘릴 수만 있어요`}
          keyboardType="number-pad"
          label="정원"
          maxLength={2}
          onChangeText={(value) => setCapacityText(value.replace(/[^0-9]/gu, ""))}
          value={capacityText}
        />
      </View>

      <GlassSurface style={styles.fixedSettings}>
        <Text style={styles.fixedSettingsTitle}>고정된 챌린지 조건</Text>
        <KeyValueRow label="주당 기준금액" value={formatWon(activeRoom.baseAmount)} />
        <KeyValueRow label="현재 참여 멤버" value={`${memberCount}명`} />
        <Text style={styles.fixedSettingsDescription}>
          기준금액은 챌린지를 시작한 뒤에는 변경할 수 없어요.
        </Text>
      </GlassSurface>

      <NoticeBanner icon="information-outline" style={styles.notice}>
        저장하면 모든 멤버에게 변경된 방 이름과 정원이 바로 보여요.
      </NoticeBanner>

      <FormMessage
        message={formError ?? (hasChanges ? validationError : null)}
        style={styles.formMessage}
      />
    </ModalFormScreen>
  );
}

function validate(input: {
  name: string;
  capacity: number;
  currentCapacity: number;
}): string | null {
  if (!isValidRoomName(input.name)) {
    return input.name.trim()
      ? `방 이름은 ${ROOM_NAME_MAX_CHARACTERS}자 이내로 입력해 주세요.`
      : "방 이름을 입력해 주세요.";
  }
  if (!isValidRoomCapacity(input.capacity)) {
    return `정원은 방장을 포함해 1~${DEFAULT_MAX_ACTIVE_MEMBERS}명으로 입력해 주세요.`;
  }
  if (input.capacity < input.currentCapacity) {
    return `정원은 현재 ${input.currentCapacity}명보다 작게 설정할 수 없어요.`;
  }
  return null;
}

const styles = StyleSheet.create({
  capacityBlock: { marginTop: spacing.xl },
  fixedSettings: {
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.xl,
    backgroundColor: palette.paper,
  },
  fixedSettingsTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  fixedSettingsDescription: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 12,
    lineHeight: 19,
  },
  notice: { marginTop: spacing.xl },
  formMessage: { marginTop: spacing.md },
});
