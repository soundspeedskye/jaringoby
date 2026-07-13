import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Field } from "@/components/ui/field";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PlatformDateTimePicker } from "@/components/ui/platform-date-time-picker";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import type {
  AddCommentInput,
  AddExpenseInput,
  Challenge,
  Comment,
  Expense,
  Profile,
} from "@/data/types";
import {
  createChallengeTimeline,
  createCommentCommand,
  EXPENSE_CATEGORIES,
  getChallengePhase,
  prepareReplyDraft,
  validateCommentBody,
  type ChallengePhase,
  type ExpenseCategory,
  type ReplyDraft,
} from "@/domain";
import { useAppActions, useAppData } from "@/providers/app-provider";
import { useDeadlineNow } from "@/hooks/use-deadline-now";
import { formatDateLabel, formatWon } from "@/utils/format";
import { createUuid } from "@/utils/uuid";

export default function ExpenseDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const expenseId = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    addComment,
    deleteComment,
    deleteExpense,
    updateComment,
    updateExpense,
  } = useAppActions();
  const {
    currentUser,
    getChallenge,
    getComments,
    getExpense,
    getProfile,
  } = useAppData();
  const expense = expenseId ? getExpense(expenseId) : undefined;
  const challenge = expense?.challengeId
    ? getChallenge(expense.challengeId)
    : undefined;
  const timeline = useMemo(
    () =>
      challenge
        ? createChallengeTimeline({
            startDate: challenge.startDate,
            endDate: challenge.endDate,
          })
        : null,
    [challenge],
  );
  const renderedAt = useDeadlineNow(
    timeline ? [timeline.S, timeline.E, timeline.C, timeline.F] : [],
    Boolean(timeline),
  );
  const comments = useMemo(
    () =>
      expense
        ? [...getComments(expense.id)].sort(
            (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
          )
        : [],
    [expense, getComments],
  );
  const profilesById = useMemo(() => {
    const profiles = new Map<string, Profile>();
    comments.forEach((comment) => {
      const profile = getProfile(comment.userId);
      if (profile) profiles.set(profile.id, profile);
    });
    return profiles;
  }, [comments, getProfile]);
  const author = expense ? getProfile(expense.userId) : undefined;
  const phase = timeline
    ? getChallengePhase(timeline, renderedAt)
    : null;
  const canMutateExpense = Boolean(
    expense &&
    currentUser &&
    expense.userId === currentUser.id &&
    (phase === "ACTIVE" || phase === "ADJUSTMENT"),
  );
  const canMutateComments =
    phase === "ACTIVE" || phase === "ADJUSTMENT" || phase === "SETTLEMENT";
  const [editingExpense, setEditingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);

  if (!expense || !expenseId) {
    return (
      <Screen testID="expense-detail-screen">
        <TopBar onBack={() => router.back()} />
        <View style={styles.notFound}>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="receipt-text-remove-outline"
            size={44}
          />
          <Text style={styles.notFoundTitle}>지출 기록을 찾을 수 없어요.</Text>
          <PrimaryButton
            label="뒤로 가기"
            onPress={() => router.back()}
            variant="secondary"
          />
        </View>
      </Screen>
    );
  }

  const removeExpense = () => {
    Alert.alert(
      "지출 기록 삭제",
      "보정 마감 전까지 삭제할 수 있으며, 방 합계에서도 제외돼요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () =>
            void (async () => {
              try {
                await deleteExpense(expense.id);
                router.back();
              } catch (reason) {
                setExpenseError(
                  reason instanceof Error
                    ? reason.message
                    : "지출을 삭제하지 못했어요.",
                );
              }
            })(),
        },
      ],
    );
  };

  return (
    <Screen testID="expense-detail-screen">
      <TopBar onBack={() => router.back()} />

      {phase === "ARCHIVED" ? (
        <View style={styles.readOnlyBanner}>
          <MaterialCommunityIcons
            color={palette.green}
            name="archive-lock-outline"
            size={19}
          />
          <Text style={styles.readOnlyText}>
            완료된 챌린지의 읽기 전용 기록이에요.
          </Text>
        </View>
      ) : phase === "SETTLEMENT" ? (
        <View style={styles.readOnlyBanner}>
          <MaterialCommunityIcons
            color={palette.green}
            name="calculator-variant-outline"
            size={19}
          />
          <Text style={styles.readOnlyText}>
            정산 중이라 지출은 잠겼지만 댓글은 남길 수 있어요.
          </Text>
        </View>
      ) : null}

      <ExpenseSummary author={author} challenge={challenge} expense={expense} />

      {canMutateExpense && !editingExpense ? (
        <View style={styles.expenseActions}>
          <PrimaryButton
            label="내 지출 수정"
            onPress={() => {
              setExpenseError(null);
              setEditingExpense(true);
            }}
            variant="secondary"
            style={styles.flexButton}
          />
          <Pressable
            accessibilityRole="button"
            onPress={removeExpense}
            style={styles.deleteExpenseButton}
          >
            <MaterialCommunityIcons
              color={palette.danger}
              name="trash-can-outline"
              size={20}
            />
          </Pressable>
        </View>
      ) : null}

      {editingExpense ? (
        <ExpenseEditor
          expense={expense}
          onClose={() => setEditingExpense(false)}
          updateExpense={updateExpense}
        />
      ) : null}

      {expenseError ? (
        <Text accessibilityRole="alert" style={styles.threadError}>
          {expenseError}
        </Text>
      ) : null}
      <CommentSection
        addComment={addComment}
        canMutate={canMutateComments}
        comments={comments}
        currentUserId={currentUser?.id}
        deleteComment={deleteComment}
        expenseId={expense.id}
        phase={phase}
        profilesById={profilesById}
        updateComment={updateComment}
      />
    </Screen>
  );
}

const ExpenseSummary = memo(function ExpenseSummary({
  author,
  challenge,
  expense,
}: {
  author?: Profile;
  challenge?: Challenge;
  expense: Expense;
}) {
  return (
    <View style={styles.expenseCard}>
      <View style={styles.expenseHeader}>
        <View style={styles.authorRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{author?.avatar ?? "🙂"}</Text>
          </View>
          <View style={styles.authorCopy}>
            <Text style={styles.authorName}>
              {author?.nickname ?? "알 수 없음"}
            </Text>
            <Text style={styles.expenseMeta}>
              {expense.category} · {formatDateLabel(expense.occurredAt)}
              {expense.createdAt !== expense.updatedAt ? " · 수정됨" : ""}
            </Text>
          </View>
        </View>
        <Text style={styles.expenseAmount}>{formatWon(expense.amount)}</Text>
      </View>
      <Image
        accessibilityLabel={`${expense.category} 지출 사진`}
        contentFit="cover"
        source={{ uri: expense.photoUri }}
        style={styles.expensePhoto}
      />
      <View style={styles.expenseCopy}>
        <Text style={styles.expenseMemo}>{expense.memo || "메모 없음"}</Text>
        {challenge ? (
          <Text style={styles.challengeLabel}>{challenge.name}</Text>
        ) : null}
        {expense.syncStatus !== "SYNCED" ? (
          <Text style={styles.sync}>
            {expense.syncStatus === "PENDING"
              ? "동기화 대기"
              : "전송 실패 · 다시 시도 필요"}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

function ExpenseEditor({
  expense,
  onClose,
  updateExpense,
}: {
  expense: Expense;
  onClose: () => void;
  updateExpense: (
    expenseId: string,
    patch: Partial<AddExpenseInput>,
  ) => Promise<Expense>;
}) {
  const [draftAmount, setDraftAmount] = useState(String(expense.amount));
  const [draftCategory, setDraftCategory] = useState<ExpenseCategory>(
    expense.category,
  );
  const [draftMemo, setDraftMemo] = useState(expense.memo);
  const [draftPhoto, setDraftPhoto] = useState(expense.photoUri ?? "");
  const [draftOccurredAt, setDraftOccurredAt] = useState(
    () => new Date(expense.occurredAt),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replacePhoto = async () => {
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("사진 보관함 권한이 필요해요.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        allowsMultipleSelection: false,
        exif: false,
        mediaTypes: ["images"],
        quality: 0.78,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const sanitized = await ImageManipulator.manipulateAsync(
          asset.uri,
          asset.width > 1_600 ? [{ resize: { width: 1_600 } }] : [],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        setDraftPhoto(sanitized.uri);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "사진을 교체하지 못했어요.",
      );
    }
  };

  const save = async () => {
    const amount = Number(draftAmount.replace(/[^0-9]/gu, ""));
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setError("금액을 1원 이상의 정수로 입력해 주세요.");
      return;
    }
    if (!draftPhoto) {
      setError("챌린지 지출에는 사진이 정확히 1장 필요해요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateExpense(expense.id, {
        amount,
        category: draftCategory,
        memo: draftMemo.trim(),
        photoUri: draftPhoto,
        occurredAt: draftOccurredAt.toISOString(),
      });
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "지출을 수정하지 못했어요.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassSurface style={styles.editorCard} testID="expense-inline-editor">
      <View style={styles.editorHeader}>
        <Text style={styles.editorTitle}>지출 수정</Text>
        <Pressable accessibilityLabel="수정 취소" onPress={onClose}>
          <MaterialCommunityIcons
            color={palette.muted}
            name="close"
            size={21}
          />
        </Pressable>
      </View>
      <Field
        keyboardType="number-pad"
        label="금액"
        onChangeText={setDraftAmount}
        value={draftAmount}
      />
      <View style={styles.editCategories}>
        {EXPENSE_CATEGORIES.map((item) => (
          <Pressable
            key={item}
            onPress={() => setDraftCategory(item)}
            style={[
              styles.editCategory,
              item === draftCategory && styles.editCategorySelected,
            ]}
          >
            <Text
              style={[
                styles.editCategoryText,
                item === draftCategory && styles.editCategoryTextSelected,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Field
        label="메모"
        maxLength={200}
        multiline
        onChangeText={setDraftMemo}
        style={styles.editMemo}
        value={draftMemo}
      />
      <Image
        accessibilityLabel="수정할 지출 사진"
        contentFit="cover"
        source={{ uri: draftPhoto }}
        style={styles.editPhoto}
      />
      <PrimaryButton
        label="사진 교체"
        onPress={() => void replacePhoto()}
        variant="secondary"
      />
      <Text style={styles.editDate}>{formatFullDate(draftOccurredAt)}</Text>
      <View style={styles.pickerRow}>
        <InlineDatePicker
          label="날짜 변경"
          mode="date"
          onChange={setDraftOccurredAt}
          value={draftOccurredAt}
        />
        <InlineDatePicker
          label="시간 변경"
          mode="time"
          onChange={setDraftOccurredAt}
          value={draftOccurredAt}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.threadError}>
          {error}
        </Text>
      ) : null}
      <PrimaryButton
        label="수정 내용 저장"
        loading={saving}
        onPress={() => void save()}
      />
    </GlassSurface>
  );
}

type CommentActionProps = {
  addComment: (input: AddCommentInput) => Promise<Comment>;
  deleteComment: (commentId: string) => Promise<void>;
  updateComment: (commentId: string, body: string) => Promise<Comment>;
};

function CommentSection({
  addComment,
  canMutate,
  comments,
  currentUserId,
  deleteComment,
  expenseId,
  phase,
  profilesById,
  updateComment,
}: CommentActionProps & {
  canMutate: boolean;
  comments: Comment[];
  currentUserId?: string;
  expenseId: string;
  phase: ChallengePhase | null;
  profilesById: ReadonlyMap<string, Profile>;
}) {
  const composerRef = useRef<TextInput>(null);
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const commentsById = useMemo(
    () => new Map(comments.map((comment) => [comment.id, comment])),
    [comments],
  );
  const editDeadlines = useMemo(
    () =>
      comments
        .filter(
          (comment) =>
            comment.userId === currentUserId && !comment.deletedAt,
        )
        .map((comment) => Date.parse(comment.createdAt) + 5 * 60 * 1_000),
    [comments, currentUserId],
  );
  const renderedAt = useDeadlineNow(editDeadlines, canMutate);
  const commentCount = useMemo(
    () => comments.filter((comment) => !comment.deletedAt).length,
    [comments],
  );
  const selectReply = useCallback(
    (comment: Comment) => {
      const profile = profilesById.get(comment.userId);
      setReplyDraft(
        prepareReplyDraft({
          messageId: comment.id,
          authorNickname: profile?.nickname ?? "알 수 없음",
          body: comment.body,
          deleted: Boolean(comment.deletedAt),
          replyToMessageId: comment.replyToId,
        }),
      );
      setFeedback("답글 대상을 선택했어요.");
      composerRef.current?.focus();
    },
    [profilesById],
  );
  const beginEdit = useCallback((commentId: string) => {
    setEditingCommentId(commentId);
  }, []);
  const finishEdit = useCallback(() => {
    setEditingCommentId(null);
  }, []);

  return (
    <>
      <View style={styles.threadHeader}>
        <View>
          <Text style={styles.threadTitle}>댓글 {commentCount}</Text>
          <Text style={styles.threadRule}>
            메시지를 길게 눌러 답글·복사 · 본인 댓글은 작성 후 5분 내 수정
          </Text>
        </View>
        <MaterialCommunityIcons
          color={palette.greenSoft}
          name="message-text-outline"
          size={23}
        />
      </View>

      <View accessibilityLabel="지출 댓글 대화" style={styles.messages}>
        {comments.length ? (
          comments.map((comment) => {
            const replied = comment.replyToId
              ? commentsById.get(comment.replyToId)
              : undefined;
            const canEdit =
              comment.userId === currentUserId &&
              !comment.deletedAt &&
              renderedAt < Date.parse(comment.createdAt) + 5 * 60 * 1_000;
            return (
              <CommentItem
                canEdit={canEdit}
                canMutate={canMutate}
                comment={comment}
                currentUserId={currentUserId}
                deleteComment={deleteComment}
                editing={
                  editingCommentId === comment.id && canMutate && canEdit
                }
                key={comment.id}
                onBeginEdit={beginEdit}
                onError={setError}
                onFeedback={setFeedback}
                onFinishEdit={finishEdit}
                onReply={selectReply}
                profile={profilesById.get(comment.userId)}
                replied={replied}
                repliedProfile={
                  replied ? profilesById.get(replied.userId) : undefined
                }
                updateComment={updateComment}
              />
            );
          })
        ) : (
          <View style={styles.noMessages}>
            <Text style={styles.noMessagesText}>
              아직 댓글이 없어요. 첫 응원을 남겨 보세요.
            </Text>
          </View>
        )}
      </View>

      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>
          {feedback}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.threadError}>
          {error}
        </Text>
      ) : null}

      {canMutate ? (
        <CommentComposer
          addComment={addComment}
          expenseId={expenseId}
          inputRef={composerRef}
          onError={setError}
          onFeedback={setFeedback}
          onReplyChange={setReplyDraft}
          replyDraft={replyDraft}
        />
      ) : (
        <View style={styles.closedComposer}>
          <MaterialCommunityIcons
            color={palette.muted}
            name="lock-outline"
            size={17}
          />
          <Text style={styles.closedComposerText}>
            {phase === "WAITING"
              ? "챌린지가 시작되면 댓글을 남길 수 있어요."
              : "완료된 대화는 읽기 전용으로 보관돼요."}
          </Text>
        </View>
      )}
    </>
  );
}

const CommentItem = memo(function CommentItem({
  canEdit,
  canMutate,
  comment,
  currentUserId,
  deleteComment,
  editing,
  onBeginEdit,
  onError,
  onFeedback,
  onFinishEdit,
  onReply,
  profile,
  replied,
  repliedProfile,
  updateComment,
}: Omit<CommentActionProps, "addComment"> & {
  canEdit: boolean;
  canMutate: boolean;
  comment: Comment;
  currentUserId?: string;
  editing: boolean;
  onBeginEdit: (commentId: string) => void;
  onError: (message: string | null) => void;
  onFeedback: (message: string | null) => void;
  onFinishEdit: () => void;
  onReply: (comment: Comment) => void;
  profile?: Profile;
  replied?: Comment;
  repliedProfile?: Profile;
}) {
  const mine = comment.userId === currentUserId;
  const [editingBody, setEditingBody] = useState(comment.body);

  const copyMessage = useCallback(async () => {
    if (comment.deletedAt) return;
    await Clipboard.setStringAsync(comment.body);
    onFeedback("메시지를 복사했어요.");
  }, [comment, onFeedback]);
  const openMessageMenu = useCallback(() => {
    const buttons = [
      { text: "답글", onPress: () => onReply(comment) },
      ...(!comment.deletedAt
        ? [{ text: "복사", onPress: () => void copyMessage() }]
        : []),
      { text: "취소", style: "cancel" as const },
    ];
    Alert.alert(
      "메시지 메뉴",
      "답글을 선택하면 입력창 위에 원문이 읽기 전용으로 표시돼요.",
      buttons,
    );
  }, [comment, copyMessage, onReply]);
  const saveEdit = async () => {
    const validation = validateCommentBody(editingBody);
    if (!validation.valid) {
      onError(
        validation.reason === "TOO_LONG"
          ? "댓글은 공백 제외 500자까지 입력할 수 있어요."
          : "댓글 내용을 입력해 주세요.",
      );
      return;
    }
    try {
      await updateComment(comment.id, editingBody);
      onFinishEdit();
      onError(null);
    } catch (reason) {
      onError(
        reason instanceof Error ? reason.message : "댓글을 수정하지 못했어요.",
      );
    }
  };
  const remove = () => {
    Alert.alert(
      "댓글 삭제",
      "답글 관계는 남고 본문은 삭제된 메시지로 표시돼요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () =>
            void deleteComment(comment.id).catch((reason: unknown) => {
              onError(
                reason instanceof Error
                  ? reason.message
                  : "댓글을 삭제하지 못했어요.",
              );
            }),
        },
      ],
    );
  };

  return (
    <View style={[styles.messageRow, mine && styles.messageRowMine]}>
      {!mine ? (
        <Text style={styles.messageAvatar}>{profile?.avatar ?? "🙂"}</Text>
      ) : null}
      <View style={[styles.messageGroup, mine && styles.messageGroupMine]}>
        {!mine ? (
          <Text style={styles.messageAuthor}>
            {profile?.nickname ?? "알 수 없음"}
          </Text>
        ) : null}
        <Pressable
          accessibilityHint="길게 눌러 답글 또는 복사"
          delayLongPress={320}
          onLongPress={openMessageMenu}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
            comment.deletedAt && styles.bubbleDeleted,
          ]}
        >
          {comment.replyToId ? (
            <View style={styles.quotedMessage}>
              <Text style={styles.quoteAuthor}>
                {repliedProfile?.nickname ?? "삭제된 메시지"}
              </Text>
              <Text numberOfLines={2} style={styles.quoteBody}>
                {replied?.deletedAt || !replied
                  ? "삭제된 메시지에 대한 답글"
                  : replied.body}
              </Text>
            </View>
          ) : null}
          {editing ? (
            <TextInput
              autoFocus
              maxLength={500}
              multiline
              onChangeText={setEditingBody}
              style={styles.editCommentInput}
              value={editingBody}
            />
          ) : (
            <Text
              style={[
                styles.messageBody,
                mine && styles.messageBodyMine,
                comment.deletedAt && styles.deletedBody,
              ]}
            >
              {comment.body}
            </Text>
          )}
        </Pressable>
        <View
          style={[styles.messageMetaRow, mine && styles.messageMetaRowMine]}
        >
          <Text style={styles.messageTime}>
            {formatCommentTime(comment.createdAt)}
            {comment.updatedAt !== comment.createdAt && !comment.deletedAt
              ? " · 수정됨"
              : ""}
          </Text>
          {comment.syncStatus !== "SYNCED" ? (
            <Text style={styles.pending}>
              {comment.syncStatus === "PENDING" ? "전송 중" : "전송 실패"}
            </Text>
          ) : null}
        </View>
        {editing ? (
          <View style={[styles.commentActions, styles.commentActionsMine]}>
            <Pressable onPress={onFinishEdit}>
              <Text style={styles.commentAction}>취소</Text>
            </Pressable>
            <Pressable onPress={() => void saveEdit()}>
              <Text style={styles.commentActionStrong}>저장</Text>
            </Pressable>
          </View>
        ) : mine && canMutate && !comment.deletedAt ? (
          <View style={[styles.commentActions, styles.commentActionsMine]}>
            {canEdit ? (
              <Pressable
                onPress={() => {
                  setEditingBody(comment.body);
                  onBeginEdit(comment.id);
                }}
              >
                <Text style={styles.commentAction}>수정</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={remove}>
              <Text style={styles.commentActionDanger}>삭제</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const CommentComposer = memo(function CommentComposer({
  addComment,
  expenseId,
  inputRef,
  onError,
  onFeedback,
  onReplyChange,
  replyDraft,
}: Pick<CommentActionProps, "addComment"> & {
  expenseId: string;
  inputRef: React.RefObject<TextInput | null>;
  onError: (message: string | null) => void;
  onFeedback: (message: string | null) => void;
  onReplyChange: (replyDraft: ReplyDraft | null) => void;
  replyDraft: ReplyDraft | null;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(createUuid);
  const bodyValid = validateCommentBody(body).valid;
  const send = async () => {
    onError(null);
    try {
      const command = createCommentCommand(body, replyDraft);
      setSending(true);
      await addComment({
        expenseId,
        body: command.body,
        replyToId: command.replyToMessageId ?? undefined,
        clientRequestId,
      });
      setBody("");
      onReplyChange(null);
      onFeedback(null);
      setClientRequestId(createUuid());
    } catch (reason) {
      onError(
        reason instanceof Error
          ? reason.message
          : "댓글을 보내지 못했어요. 다시 시도해 주세요.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <GlassSurface
      interactive
      style={styles.composer}
      testID="comment-composer"
    >
      {replyDraft ? (
        <View style={styles.replyChip}>
          <MaterialCommunityIcons
            color={palette.coral}
            name="reply"
            size={18}
          />
          <View style={styles.replyCopy}>
            <Text style={styles.replyAuthor}>
              {replyDraft.quote.authorNickname}에게 답글
            </Text>
            <Text numberOfLines={1} style={styles.replyPreview}>
              {replyDraft.quote.preview}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="답글 취소"
            onPress={() => onReplyChange(null)}
          >
            <MaterialCommunityIcons
              color={palette.muted}
              name="close-circle"
              size={20}
            />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composerRow}>
        <TextInput
          accessibilityLabel="댓글 입력"
          maxLength={500}
          multiline
          onChangeText={setBody}
          placeholder="응원이나 피드백을 남겨요"
          placeholderTextColor={palette.muted}
          ref={inputRef}
          style={styles.composerInput}
          value={body}
        />
        <Pressable
          accessibilityLabel="댓글 보내기"
          disabled={sending || !bodyValid}
          onPress={() => void send()}
          style={[
            styles.sendButton,
            (sending || !bodyValid) && styles.sendButtonDisabled,
          ]}
        >
          <MaterialCommunityIcons
            color={palette.cream}
            name={sending ? "dots-horizontal" : "send"}
            size={19}
          />
        </Pressable>
      </View>
    </GlassSurface>
  );
});

function TopBar({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel="뒤로"
        onPress={onBack}
        style={styles.backButton}
      >
        <MaterialCommunityIcons
          color={palette.green}
          name="chevron-left"
          size={26}
        />
      </Pressable>
      <Text style={styles.title}>지출 상세</Text>
    </View>
  );
}

function InlineDatePicker({
  label,
  mode,
  value,
  onChange,
}: {
  label: string;
  mode: "date" | "time";
  value: Date;
  onChange: (value: Date) => void;
}) {
  return (
    <PlatformDateTimePicker
      mode={mode}
      onChange={onChange}
      renderTrigger={(open) => (
        <View>
          <Pressable onPress={open} style={styles.pickerButton}>
            <Text style={styles.pickerButtonText}>{label}</Text>
          </Pressable>
        </View>
      )}
      renderWeb={() => <Text style={styles.webPicker}>모바일에서 {label}</Text>}
      value={value}
    />
  );
}

function formatCommentTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function formatFullDate(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(value);
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: "rgba(255,255,255,0.48)",
  },
  title: { color: palette.ink, fontSize: 28, fontWeight: "700", marginTop: 3 },
  readOnlyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(47,113,93,0.10)",
  },
  readOnlyText: { color: palette.green, flex: 1, fontSize: 12 },
  expenseCard: {
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: palette.paper,
  },
  expenseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    padding: spacing.md,
  },
  authorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: palette.cream,
  },
  avatarText: { fontSize: 21 },
  authorCopy: { flex: 1 },
  authorName: { color: palette.ink, fontSize: 14, fontWeight: "700" },
  expenseMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
  expenseAmount: { color: palette.coralText, fontSize: 17, fontWeight: "800" },
  expensePhoto: {
    width: "100%",
    aspectRatio: 16 / 10,
    backgroundColor: palette.line,
  },
  expenseCopy: { padding: spacing.md, gap: 5 },
  expenseMemo: { color: palette.ink, fontSize: 14, lineHeight: 21 },
  challengeLabel: { color: palette.green, fontSize: 11, fontWeight: "600" },
  sync: { color: palette.coralText, fontSize: 10 },
  expenseActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  flexButton: { flex: 1 },
  deleteExpenseButton: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.danger,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.46)",
  },
  editorCard: {
    gap: spacing.md,
    padding: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: "rgba(255,253,247,0.68)",
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  editorTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  editCategories: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  editCategory: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.pill,
  },
  editCategorySelected: {
    backgroundColor: palette.green,
    borderColor: palette.green,
  },
  editCategoryText: { color: palette.muted, fontSize: 11 },
  editCategoryTextSelected: { color: palette.cream, fontWeight: "700" },
  editMemo: { minHeight: 76, textAlignVertical: "top" },
  editPhoto: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: radii.md,
    backgroundColor: palette.line,
  },
  editDate: { color: palette.ink, fontSize: 13, fontWeight: "600" },
  pickerRow: { flexDirection: "row", gap: spacing.sm },
  pickerButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.green,
    borderRadius: radii.pill,
  },
  pickerButtonText: { color: palette.green, fontSize: 11, fontWeight: "600" },
  webPicker: { color: palette.muted, fontSize: 10 },
  threadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xxxl,
    marginBottom: spacing.lg,
  },
  threadTitle: { color: palette.ink, fontSize: 20, fontWeight: "800" },
  threadRule: { color: palette.muted, fontSize: 10, marginTop: 4 },
  messages: { gap: spacing.md },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingRight: 54,
  },
  messageRowMine: {
    justifyContent: "flex-end",
    paddingRight: 0,
    paddingLeft: 54,
  },
  messageAvatar: { fontSize: 22, marginTop: 18 },
  messageGroup: { alignItems: "flex-start", maxWidth: "88%" },
  messageGroupMine: { alignItems: "flex-end" },
  messageAuthor: {
    color: palette.muted,
    fontSize: 10,
    marginLeft: 4,
    marginBottom: 4,
  },
  bubble: {
    minWidth: 70,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMine: { backgroundColor: palette.green, borderBottomRightRadius: 5 },
  bubbleOther: {
    backgroundColor: palette.paper,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: palette.line,
  },
  bubbleDeleted: { opacity: 0.68 },
  quotedMessage: {
    minWidth: 120,
    paddingLeft: spacing.sm,
    paddingVertical: 4,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: palette.coral,
  },
  quoteAuthor: { color: palette.coralText, fontSize: 9, fontWeight: "700" },
  quoteBody: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  messageBody: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  messageBodyMine: { color: palette.cream },
  deletedBody: { fontStyle: "italic" },
  editCommentInput: {
    minWidth: 160,
    color: palette.cream,
    fontSize: 13,
    lineHeight: 19,
    padding: 0,
  },
  messageMetaRow: { flexDirection: "row", gap: 5, marginTop: 3, marginLeft: 4 },
  messageMetaRowMine: {
    justifyContent: "flex-end",
    marginLeft: 0,
    marginRight: 4,
  },
  messageTime: { color: palette.muted, fontSize: 9 },
  pending: { color: palette.coralText, fontSize: 9 },
  commentActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: 4,
    marginLeft: 4,
  },
  commentActionsMine: {
    justifyContent: "flex-end",
    marginLeft: 0,
    marginRight: 4,
  },
  commentAction: { color: palette.muted, fontSize: 10 },
  commentActionStrong: {
    color: palette.green,
    fontSize: 10,
    fontWeight: "700",
  },
  commentActionDanger: { color: palette.danger, fontSize: 10 },
  noMessages: { alignItems: "center", paddingVertical: spacing.xxl },
  noMessagesText: { color: palette.muted, fontSize: 12 },
  feedback: {
    color: palette.success,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
  threadError: {
    color: palette.danger,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
  composer: {
    padding: spacing.md,
    marginTop: spacing.xl,
    backgroundColor: "rgba(255,253,247,0.72)",
  },
  replyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: "rgba(233,135,98,0.10)",
  },
  replyCopy: { flex: 1 },
  replyAuthor: { color: palette.coralText, fontSize: 10, fontWeight: "700" },
  replyPreview: { color: palette.muted, fontSize: 10, marginTop: 2 },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: palette.ink,
    fontSize: 13,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  sendButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: palette.green,
  },
  sendButtonDisabled: { opacity: 0.36 },
  closedComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    justifyContent: "center",
    padding: spacing.md,
    marginTop: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: "rgba(52,49,40,0.06)",
  },
  closedComposerText: { color: palette.muted, fontSize: 11 },
  notFound: { alignItems: "center", gap: spacing.md, paddingTop: 100 },
  notFoundTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
});
