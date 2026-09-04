import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { FormSection } from "@/shared/ui/form-section";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { ANIMAL_AVATARS } from "@/shared/config/animals";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { useSubmit } from "@/shared/lib/use-submit";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { useCurrentUser } from "@/entities/member/api/use-members";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { pickSanitizedProfilePhoto } from "@/shared/services/profile-photo-picker";

type PhotoChange =
  | { kind: "unchanged" }
  | { kind: "replace"; uri: string }
  | { kind: "remove" };

export function ProfileEditPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { updateAvatar, updateNickname } = useAppActions();
  const { showDialog } = useAppDialog();
  const [nickname, setNickname] = useState(currentUser?.nickname ?? "");
  const [avatarKey, setAvatarKey] = useState(
    currentUser?.avatar ?? ANIMAL_AVATARS[0],
  );
  const [photoChange, setPhotoChange] = useState<PhotoChange>({
    kind: "unchanged",
  });
  const {
    error: message,
    setError: setMessage,
    submit,
    submitting: saving,
  } = useSubmit("프로필을 저장하지 못했어요.");
  // 화면을 연 시점만 사용한다. 최종 제한 판단은 항상 서버가 한다.
  const [openedAt] = useState(() => Date.now());

  const cooldownActive = Boolean(
    currentUser?.nicknameChangeAvailableAt &&
    Date.parse(currentUser.nicknameChangeAvailableAt) > openedAt &&
    nickname.trim() !== currentUser.nickname,
  );
  const nicknameHint = (() => {
    if (!currentUser?.nicknameChangeAvailableAt)
      return "닉네임은 7일에 한 번 변경할 수 있어요.";
    const available = new Date(currentUser.nicknameChangeAvailableAt);
    if (available.getTime() <= openedAt) return "닉네임을 변경할 수 있어요.";
    return `다음 변경 가능: ${available.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" })}`;
  })();
  const photoUri =
    photoChange.kind === "replace"
      ? photoChange.uri
      : photoChange.kind === "remove"
        ? undefined
        : currentUser?.avatarUri;

  const pickPhoto = useCallback(
    async (source: "camera" | "library") => {
      try {
        const result = await pickSanitizedProfilePhoto(source);
        if (result.status === "selected")
          setPhotoChange({ kind: "replace", uri: result.uri });
        if (result.status === "permission-denied") {
          showDialog(
            "카메라 권한이 필요해요",
            "설정에서 카메라 접근을 허용한 뒤 다시 시도해 주세요.",
          );
        }
      } catch (reason) {
        setMessage(
          reason instanceof Error
            ? reason.message
            : "사진을 준비하지 못했어요.",
        );
      }
    },
    [setMessage, showDialog],
  );

  const choosePhoto = useCallback(() => {
    showDialog(
      "프로필 사진",
      "사진을 추가하거나 현재 사진을 삭제할 수 있어요.",
      [
        { text: "취소", style: "cancel" },
        { text: "앨범에서 선택", onPress: () => void pickPhoto("library") },
        { text: "카메라로 촬영", onPress: () => void pickPhoto("camera") },
        ...(currentUser?.avatarUri || photoChange.kind === "replace"
          ? [
              {
                text: "사진 삭제",
                style: "destructive" as const,
                onPress: () => setPhotoChange({ kind: "remove" as const }),
              },
            ]
          : []),
      ],
    );
  }, [currentUser?.avatarUri, photoChange.kind, pickPhoto, showDialog]);

  const save = () =>
    submit(async () => {
      if (!currentUser) return;
      const nextNickname = nickname.trim();
      if (nextNickname.length < 2 || nextNickname.length > 20) {
        return "닉네임은 앞뒤 공백을 제외하고 2~20자로 입력해 주세요.";
      }
      if (cooldownActive) return nicknameHint;
      if (nextNickname !== currentUser.nickname) {
        await updateNickname(nextNickname);
      }
      if (
        avatarKey !== currentUser.avatar ||
        photoChange.kind !== "unchanged"
      ) {
        await updateAvatar({
          avatarKey,
          photoUri:
            photoChange.kind === "replace"
              ? photoChange.uri
              : photoChange.kind === "remove"
                ? null
                : undefined,
        });
      }
      router.back();
    });

  if (!currentUser) {
    return (
      <ModalFormScreen
        onBack={() => router.back()}
        title="프로필 편집"
        loading
      />
    );
  }

  return (
    <ModalFormScreen
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label="저장"
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      }
      onBack={() => router.back()}
      title="프로필 편집"
    >
      <FormSection title="프로필 사진">
        <View style={styles.photoSection}>
          <Pressable
            accessibilityHint="앨범, 카메라 또는 사진 삭제 메뉴를 엽니다"
            accessibilityRole="button"
            onPress={choosePhoto}
            style={styles.photoButton}
          >
            <AnimalAvatar photoUri={photoUri} size={104} value={avatarKey} />
            <View style={styles.cameraBadge}>
              <MaterialCommunityIcons
                color={palette.cream}
                name="camera"
                size={17}
              />
            </View>
          </Pressable>
          <Text style={styles.photoHelp}>
            원하는 사진으로도 변경할 수 있어요.
          </Text>
        </View>
      </FormSection>

      <FormSection style={styles.section} title="기본 아바타">
        <View style={styles.avatarGrid}>
          {ANIMAL_AVATARS.map((key) => {
            const selected = avatarKey === key;
            return (
              <Pressable
                accessibilityLabel={`${key} 아바타`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={key}
                onPress={() => setAvatarKey(key)}
                style={[
                  styles.avatarChoice,
                  selected && styles.avatarChoiceSelected,
                ]}
              >
                <AnimalAvatar size={46} value={key} />
              </Pressable>
            );
          })}
        </View>
      </FormSection>

      <FormSection style={styles.section} title="닉네임">
        <Field
          accessibilityLabel="닉네임"
          autoCapitalize="none"
          error={cooldownActive ? nicknameHint : undefined}
          hint={cooldownActive ? undefined : nicknameHint}
          maxLength={20}
          onChangeText={setNickname}
          value={nickname}
        />
      </FormSection>
      <FormMessage message={message} style={styles.message} />
    </ModalFormScreen>
  );
}

const styles = StyleSheet.create({
  photoSection: { alignItems: "center", gap: spacing.sm },
  photoButton: { position: "relative" },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.green,
    borderWidth: 2,
    borderColor: palette.cream,
  },
  photoHelp: { color: palette.muted, fontFamily: fonts.hand, fontSize: 12 },
  section: { marginTop: spacing.xxl },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  avatarChoice: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  avatarChoiceSelected: {
    borderColor: palette.green,
    backgroundColor: "rgba(47,113,93,0.08)",
  },
  message: { marginTop: spacing.xl },
  footer: { marginTop: spacing.xxl, paddingBottom: spacing.xxl },
});
