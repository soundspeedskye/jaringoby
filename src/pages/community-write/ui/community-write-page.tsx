import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useCurrentUser } from "@/entities/member/api/use-members";
import { useRoomPost } from "@/entities/post/api/use-posts";
import { useActiveRoom } from "@/entities/room/api/use-rooms";
import {
  ROOM_POST_CATEGORIES,
  type RoomPost,
  type RoomPostCategory,
} from "@/shared/api/types";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import { formatFullDate, formatKrwInput } from "@/shared/lib/format";
import { createUuid } from "@/shared/lib/uuid";
import type { ExpenseCategory } from "@/shared/model/types";
import { useSubmit } from "@/shared/lib/use-submit";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import {
  pickSanitizedExpensePhoto,
  type ExpensePhotoSource,
} from "@/shared/services/expense-photo-picker";
import { Field } from "@/shared/ui/field";
import { FormMessage } from "@/shared/ui/form-message";
import { FormSection } from "@/shared/ui/form-section";
import { ModalFormScreen } from "@/shared/ui/modal-form-screen";
import { PlatformDateTimePicker } from "@/shared/ui/platform-date-time-picker";
import { PrimaryButton } from "@/shared/ui/primary-button";

/** 뒷구매 글이 분류를 고르지 않게 된 뒤 쓰는 기본 지출 분류. */
const SECRET_PURCHASE_EXPENSE_CATEGORY: ExpenseCategory = "사치품";

export function CommunityWritePage() {
  const { id: postId } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const post = useRoomPost(postId);
  if (postId && !post) {
    return (
      <ModalFormScreen
        headerDivider
        onBack={() => router.back()}
        testID="edit-room-post-screen"
        title="글 남기기"
      >
        <FormMessage message="게시글을 찾을 수 없어요." />
      </ModalFormScreen>
    );
  }
  return <BoardPostForm key={post?.id ?? "new"} post={post} />;
}

function BoardPostForm({ post }: { post?: RoomPost }) {
  const router = useRouter();
  const room = useActiveRoom();
  const currentUser = useCurrentUser();
  const { addRoomPost, updateRoomPost } = useAppActions();
  const isEditing = Boolean(post);
  const [category, setCategory] = useState<RoomPostCategory | undefined>(
    post?.category ?? (post?.kind === "POLL" ? undefined : "거지력"),
  );
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [isNotice, setIsNotice] = useState(post?.kind === "NOTICE");
  const [isPoll, setIsPoll] = useState(post?.kind === "POLL");
  const [options, setOptions] = useState(["", ""]);
  const [amountText, setAmountText] = useState(
    post?.secretPurchase
      ? formatKrwInput(String(post.secretPurchase.amount))
      : "",
  );
  const [occurredAt, setOccurredAt] = useState(() =>
    post?.secretPurchase
      ? new Date(post.secretPurchase.occurredAt)
      : new Date(),
  );
  // 뒷구매는 지출 분류를 묻지 않는다. 다만 저장에는 값이 필요해서(뒷구매 글은
  // 분류가 있어야 한다는 DB 제약) 수정 시에는 기존 값을, 새 글에는 기본값을 쓴다.
  const expenseCategory: ExpenseCategory =
    post?.secretPurchase?.expenseCategory ?? SECRET_PURCHASE_EXPENSE_CATEGORY;
  const [photoUri, setPhotoUri] = useState<string | null>(
    post?.photoUri ?? null,
  );
  const [photoMode, setPhotoMode] = useState<"keep" | "remove" | "replace">(
    "keep",
  );
  const { error, setError, submit, submitting } = useSubmit(
    "기록을 남기지 못했어요.",
  );
  const isSecretPurchase = category === "뒷구매";
  const isOwner = Boolean(
    room && currentUser && room.ownerId === currentUser.id,
  );
  const isPostKindLocked = isEditing && post?.kind !== "POST";
  const canEdit =
    !isEditing ||
    Boolean(
      post &&
      room?.status === "OPEN" &&
      currentUser &&
      (post.authorId === currentUser.id ||
        (post.kind === "NOTICE" && room.ownerId === currentUser.id)),
    );
  const normalizedOptions = options
    .map((option) => option.trim())
    .filter(Boolean);
  const hasValidPollOptions =
    normalizedOptions.length >= 2 &&
    new Set(normalizedOptions).size === normalizedOptions.length;

  const pickPhoto = async (source: ExpensePhotoSource) => {
    setError(null);
    try {
      const result = await pickSanitizedExpensePhoto(source);
      if (result.status === "permission-denied") {
        setError("카메라 권한을 허용해야 사진을 촬영할 수 있어요.");
      } else if (result.status === "selected") {
        setPhotoUri(result.uri);
        if (isEditing) setPhotoMode("replace");
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "사진을 불러오지 못했어요.",
      );
    }
  };

  const selectCategory = (next: RoomPostCategory) => {
    setCategory(next);
    setCategoryOpen(false);
    if (next === "뒷구매") {
      setIsNotice(false);
      setIsPoll(false);
    }
  };

  const savePost = () =>
    submit(async () => {
      const trimmedBody = body.trim();
      const amountDigits = amountText.replace(/[^0-9]/gu, "");
      const amount = Number(amountDigits);
      const submittedTitle = isSecretPurchase ? "뒷구매 고해성사" : title.trim();
      if (!room || !trimmedBody || !submittedTitle || !canEdit) return;
      if (!isEditing && isPoll && !hasValidPollOptions) {
        return "서로 다른 선택지를 2개 이상 입력해 주세요.";
      }
      if (
        isSecretPurchase &&
        (!amountDigits || !Number.isSafeInteger(amount) || amount < 1)
      ) {
        return "뒷구매 금액을 1원 이상의 정수로 입력해 주세요.";
      }
      const secretPurchase = isSecretPurchase
        ? { amount, occurredAt: occurredAt.toISOString(), expenseCategory }
        : undefined;
      if (isEditing) {
        if (!post) throw new Error("게시글을 찾을 수 없어요.");
        await updateRoomPost({
          postId: post.id,
          category: post.kind === "POLL" ? undefined : category,
          title: submittedTitle,
          body: trimmedBody,
          photo:
            photoMode === "keep"
              ? { mode: "keep" }
              : photoMode === "remove"
                ? { mode: "remove" }
                : {
                    mode: "replace",
                    uri: photoUri ?? "",
                    clientRequestId: createUuid(),
                  },
          secretPurchase,
        });
        router.replace(`/community/${post.id}`);
        return;
      }
      await addRoomPost({
        roomId: room.id,
        kind: isNotice ? "NOTICE" : isPoll ? "POLL" : "POST",
        category: isPoll ? undefined : category,
        title: submittedTitle,
        body: trimmedBody,
        options: isPoll ? normalizedOptions : undefined,
        photoUri: photoUri ?? undefined,
        secretPurchase,
        clientRequestId: createUuid(),
      });
      router.back();
    });

  const canSubmit = Boolean(
    room &&
    body.trim() &&
    (isSecretPurchase || title.trim()) &&
    !submitting &&
    canEdit &&
    (isEditing || !isPoll || hasValidPollOptions),
  );

  return (
    <ModalFormScreen
      headerDivider
      onBack={() => router.back()}
      testID="new-room-post-screen"
      title="글 남기기"
    >
      {!isEditing && !isSecretPurchase && isOwner ? (
        <View style={styles.firstToggle}>
          <ToggleRow
            checked={isNotice}
            label="공지로 올리기"
            onPress={() => {
              setIsNotice((value) => !value);
              setIsPoll(false);
              setCategoryOpen(false);
            }}
          />
        </View>
      ) : null}
      {!isEditing && !isSecretPurchase && !isNotice ? (
        <ToggleRow
          checked={isPoll}
          label="투표로 만들기"
          onPress={() => {
            setIsPoll((value) => !value);
            setCategoryOpen(false);
          }}
          tone="coral"
        />
      ) : null}

      {!isNotice && !isPoll ? (
        <>
          <Text style={styles.fieldLabel}>카테고리</Text>
          <Pressable
            accessibilityLabel="카테고리 선택"
            accessibilityRole="button"
            disabled={isPostKindLocked}
            onPress={() => setCategoryOpen((open) => !open)}
            style={styles.categorySelect}
          >
            <Text style={styles.categoryValue}>{category}</Text>
            <Text style={styles.categoryArrow}>{categoryOpen ? "⌃" : "⌄"}</Text>
          </Pressable>
          {categoryOpen && !isPostKindLocked ? (
            <View style={styles.categoryMenu}>
              {ROOM_POST_CATEGORIES.filter(
                (item) => post?.kind !== "POLL" || item !== "뒷구매",
              ).map((item) => (
                <Pressable
                  accessibilityRole="button"
                  key={item}
                  onPress={() => selectCategory(item)}
                  style={styles.categoryOption}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      category === item && styles.categoryOptionSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {isSecretPurchase ? (
        <SecretPurchaseFields
          amountText={amountText}
          occurredAt={occurredAt}
          onChangeAmount={(value) => setAmountText(formatKrwInput(value))}
          onChangeOccurredAt={setOccurredAt}
        />
      ) : (
        <>
          <Text style={styles.fieldLabel}>제목</Text>
          <Field
            accessibilityLabel="제목"
            maxLength={100}
            onChangeText={setTitle}
            placeholder="제목을 입력해 주세요"
            value={title}
          />
        </>
      )}

      <Text style={styles.fieldLabel}>내용</Text>
      <Field
        accessibilityLabel={isPoll ? "투표 내용" : "내용"}
        maxLength={500}
        multiline
        onChangeText={setBody}
        placeholder={
          isSecretPurchase
            ? "주말의 나에게 한마디 남겨요"
            : isPoll
              ? "투표 내용을 입력해 주세요"
              : "같이 나누고 싶은 이야기를 남겨 주세요"
        }
        style={styles.bodyField}
        textAlignVertical="top"
        value={body}
      />
      <Text style={styles.count}>{body.length}/500</Text>

      {isPoll && !isEditing ? (
        <PollOptions
          options={options}
          onAdd={() =>
            setOptions((current) =>
              current.length < 4 ? [...current, ""] : current,
            )
          }
          onChange={(index, value) =>
            setOptions((current) =>
              current.map((option, optionIndex) =>
                optionIndex === index ? value : option,
              ),
            )
          }
          onRemove={(index) =>
            setOptions((current) =>
              current.length > 2
                ? current.filter((_, optionIndex) => optionIndex !== index)
                : current,
            )
          }
        />
      ) : null}

      <PhotoAttachment
        photoUri={photoUri}
        onPick={pickPhoto}
        onRemove={() => {
          setPhotoUri(null);
          if (isEditing) setPhotoMode("remove");
        }}
      />
      <FormMessage message={error} />
      <PrimaryButton
        disabled={!canSubmit}
        label={
          submitting
            ? isEditing
              ? "수정 중…"
              : "등록 중…"
            : isEditing
              ? "수정 완료"
              : "등록"
        }
        onPress={() => void savePost()}
        style={styles.submit}
      />
    </ModalFormScreen>
  );
}

function SecretPurchaseFields({
  amountText,
  occurredAt,
  onChangeAmount,
  onChangeOccurredAt,
}: {
  amountText: string;
  occurredAt: Date;
  onChangeAmount: (value: string) => void;
  onChangeOccurredAt: (value: Date) => void;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>금액</Text>
      <Field
        keyboardType="number-pad"
        onChangeText={onChangeAmount}
        placeholder="0"
        style={styles.amountField}
        value={amountText}
      />
      <Text style={styles.fieldLabel}>구매 일시</Text>
      <PlatformDateTimePicker
        iosModalTitle="구매 일시 변경"
        iosPresentation="modal"
        maximumDate={new Date()}
        mode="datetime"
        onChange={onChangeOccurredAt}
        renderTrigger={(open) => (
          <DateTimeCard onPress={open} value={occurredAt} />
        )}
        renderWeb={() => (
          <DateTimeCard onPress={() => undefined} value={occurredAt} />
        )}
        value={occurredAt}
      />
    </>
  );
}

function DateTimeCard({
  onPress,
  value,
}: {
  onPress: () => void;
  value: Date;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.timeCard}
    >
      <Text style={styles.timeValue}>{formatFullDate(value)}</Text>
      <MaterialCommunityIcons
        color={palette.green}
        name="chevron-right"
        size={22}
      />
    </Pressable>
  );
}

function ToggleRow({
  checked,
  hint,
  label,
  onPress,
  tone = "green",
}: {
  checked: boolean;
  hint?: string;
  label: string;
  onPress: () => void;
  tone?: "green" | "coral";
}) {
  const selected = tone === "coral" ? styles.coralToggle : styles.greenToggle;
  const boxSelected = tone === "coral" ? styles.coralBox : styles.greenBox;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[styles.toggle, checked && selected]}
    >
      <View style={[styles.box, checked && boxSelected]}>
        {checked ? <Text style={styles.check}>✓</Text> : null}
      </View>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function PollOptions({
  options,
  onAdd,
  onChange,
  onRemove,
}: {
  options: string[];
  onAdd: () => void;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={styles.optionsSection}>
      <Text style={styles.optionsTitle}>선택지</Text>
      {options.map((option, index) => (
        <View key={index} style={styles.optionRow}>
          <Field
            containerStyle={styles.optionField}
            maxLength={60}
            onChangeText={(value) => onChange(index, value)}
            placeholder={`선택지 ${index + 1}`}
            value={option}
          />
          {options.length > 2 ? (
            <Pressable
              accessibilityLabel={`선택지 ${index + 1} 삭제`}
              onPress={() => onRemove(index)}
              style={styles.removeOption}
            >
              <Text style={styles.removeOptionText}>−</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {options.length < 4 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAdd}
          style={styles.addOption}
        >
          <Text style={styles.addOptionText}>+ 선택지 추가</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PhotoAttachment({
  photoUri,
  onPick,
  onRemove,
}: {
  photoUri: string | null;
  onPick: (source: ExpensePhotoSource) => Promise<void>;
  onRemove: () => void;
}) {
  return (
    <FormSection title="사진">
      {photoUri ? (
        <View style={styles.photoFrame}>
          <Image
            contentFit="cover"
            source={{ uri: photoUri }}
            style={styles.photo}
          />
          <Pressable
            accessibilityLabel="사진 제거"
            onPress={onRemove}
            style={styles.removePhoto}
          >
            <MaterialCommunityIcons
              color={palette.cream}
              name="close"
              size={18}
            />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.photoActions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void onPick("camera")}
          style={styles.photoButton}
        >
          <MaterialCommunityIcons
            color={palette.green}
            name="camera-outline"
            size={20}
          />
          <Text style={styles.photoButtonText}>카메라</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void onPick("library")}
          style={styles.photoButton}
        >
          <MaterialCommunityIcons
            color={palette.green}
            name="image-multiple-outline"
            size={20}
          />
          <Text style={styles.photoButtonText}>
            {photoUri ? "사진 교체" : "앨범에서 선택"}
          </Text>
        </Pressable>
      </View>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  firstToggle: { marginTop: spacing.md },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  greenToggle: {
    borderColor: palette.green,
    backgroundColor: "rgba(47,113,93,0.06)",
  },
  coralToggle: {
    borderColor: palette.coral,
    backgroundColor: "rgba(233,135,98,0.08)",
  },
  box: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.sm,
    backgroundColor: palette.paper,
  },
  greenBox: { borderColor: palette.green, backgroundColor: palette.green },
  coralBox: { borderColor: palette.coral, backgroundColor: palette.coral },
  check: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleCopy: { flex: 1 },
  toggleTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleHint: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 11,
    marginTop: 3,
  },
  fieldLabel: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  categorySelect: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  categoryValue: { color: palette.ink, fontFamily: fonts.hand, fontSize: 14 },
  categoryArrow: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 16,
  },
  categoryMenu: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  categoryOption: {
    borderBottomColor: palette.rule,
    borderBottomWidth: 1,
    padding: spacing.md,
  },
  categoryOptionText: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 13,
  },
  categoryOptionSelected: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontWeight: "700",
  },
  amountField: { ...tabularNums, textAlign: "right" },
  timeCard: {
    alignItems: "center",
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  timeValue: { color: palette.ink, fontFamily: fonts.hand, fontSize: 15 },
  bodyField: { minHeight: 160, paddingTop: spacing.md },
  count: {
    alignSelf: "flex-end",
    color: palette.muted,
    fontFamily: fonts.number,
    fontSize: 11,
    marginTop: spacing.xs,
  },
  optionsSection: { marginTop: spacing.lg, gap: spacing.sm },
  optionsTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  optionRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  optionField: { width: 240 },
  removeOption: {
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: palette.rule,
  },
  removeOptionText: {
    color: palette.muted,
    fontFamily: fonts.handBold,
    fontSize: 20,
  },
  addOption: { alignSelf: "flex-start", paddingVertical: spacing.sm },
  addOptionText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  photoFrame: {
    overflow: "hidden",
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: radii.lg,
    backgroundColor: palette.line,
  },
  photo: { width: "100%", height: "100%" },
  removePhoto: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: palette.ink,
  },
  photoActions: { flexDirection: "row", gap: spacing.sm },
  photoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: palette.paper,
  },
  photoButtonText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 12,
    fontWeight: "700",
  },
  submit: { marginTop: spacing.lg },
});
