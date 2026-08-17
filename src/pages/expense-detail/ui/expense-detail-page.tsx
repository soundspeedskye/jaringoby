import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";

import { ExpenseSummary } from "@/entities/expense/ui/expense-summary";
import { createPeriodTimeline, getPeriodPhase } from "@/shared/lib/domain/period";
import {
  isCommentMutationPhase,
  isExpenseMutationPhase,
} from "@/shared/lib/domain/permissions";
import { ExpenseExceptionCard } from "@/features/exception-approval";
import { ExpenseEditor } from "@/features/expense-edit";
import { fonts, palette, radii, spacing } from "@/shared/config/design";
import { useDeadlineNow } from "@/shared/lib/use-deadline-now";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import {
  useCurrentUser,
  useExpense,
  useExpenseComments,
  usePeriod,
  useProfiles,
  useReactionsByCommentId,
  useRoom,
} from "@/shared/providers/app-data-hooks";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { EmptyState } from "@/shared/ui/empty-state";
import { FormMessage } from "@/shared/ui/form-message";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PageHeader } from "@/shared/ui/page-header";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { Screen, ScreenFrame } from "@/shared/ui/screen";
import { CommentSection } from "@/widgets/comment-thread";

export function ExpenseDetailPage() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const { id: expenseId, rid: requestId } = useLocalSearchParams<
    "/expense/[id]",
    { rid?: string }
  >();
  const {
    addComment,
    deleteComment,
    deleteExpense,
    toggleCommentReaction,
    updateComment,
    updateExpense,
  } = useAppActions();
  const currentUser = useCurrentUser();
  // 저장 직후 오프라인 큐가 낙관적 ID를 서버 ID로 교체하면 라우트의 id로는
  // 더 이상 찾을 수 없다. 교체 전후로 불변인 멱등 키(rid)로 폴백 조회한다.
  const expense = useExpense(expenseId, requestId);
  const period = usePeriod(expense?.periodId);
  const room = useRoom(period?.roomId);
  const expenseComments = useExpenseComments(expense?.id);
  const timeline = useMemo(
    () => (period ? createPeriodTimeline(period.weekStart) : null),
    [period],
  );
  const renderedAt = useDeadlineNow(
    timeline ? [timeline.S, timeline.E, timeline.C, timeline.F] : [],
    Boolean(timeline),
  );
  const comments = useMemo(
    () =>
      expense
        ? [...expenseComments].sort(
            (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
          )
        : [],
    [expense, expenseComments],
  );
  const commentIds = useMemo(
    () => comments.map((comment) => comment.id),
    [comments],
  );
  const reactionsByCommentId = useReactionsByCommentId(commentIds);
  const profileUserIds = useMemo(
    () => [
      ...(expense ? [expense.userId] : []),
      ...comments.map((comment) => comment.userId),
    ],
    [comments, expense],
  );
  const profilesById = useProfiles(profileUserIds);
  const author = expense ? profilesById.get(expense.userId) : undefined;
  const phase = timeline ? getPeriodPhase(timeline, renderedAt) : null;
  const canMutateExpense = Boolean(
    expense &&
    currentUser &&
    expense.userId === currentUser.id &&
    phase &&
    isExpenseMutationPhase(phase),
  );
  const canMutateComments = phase ? isCommentMutationPhase(phase) : false;
  const [editingExpense, setEditingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  // New expenses replace the form route with this detail route, so there may
  // be no reliable native history to pop. The challenge home is the stable
  // return destination after viewing, deleting, or cancelling a new expense.
  const returnToChallengeHome = useCallback(() => {
    router.replace("/");
  }, [router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        returnToChallengeHome();
        return true;
      },
    );
    return () => subscription.remove();
  }, [returnToChallengeHome]);

  if (!expense || !expenseId) {
    return (
      <Screen testID="expense-detail-screen">
        <PageHeader onBack={returnToChallengeHome} title="지출 상세" />
        <EmptyState
          action={
            <PrimaryButton
              label="뒤로 가기"
              onPress={returnToChallengeHome}
              variant="secondary"
            />
          }
          icon="receipt-text-remove-outline"
          title="지출 기록을 찾을 수 없어요."
        />
      </Screen>
    );
  }

  const removeExpense = () => {
    showDialog(
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
                returnToChallengeHome();
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
    <ScreenFrame testID="expense-detail-screen">
      <CommentSection
        addComment={addComment}
        canMutate={canMutateComments}
        comments={comments}
        currentUserId={currentUser?.id}
        reactionsByCommentId={reactionsByCommentId}
        deleteComment={deleteComment}
        expenseId={expense.id}
        header={
          <>
            <PageHeader onBack={returnToChallengeHome} title="지출 상세" />

            {phase === "ARCHIVED" ? (
              <NoticeBanner
                icon="archive-lock-outline"
                style={styles.readOnlyBanner}
              >
                완료된 챌린지의 읽기 전용 기록이에요.
              </NoticeBanner>
            ) : phase === "SETTLEMENT" ? (
              <NoticeBanner
                icon="calculator-variant-outline"
                style={styles.readOnlyBanner}
              >
                정산 중이라 지출은 잠겼지만 댓글은 남길 수 있어요.
              </NoticeBanner>
            ) : null}

            <ExpenseSummary
              author={author}
              expense={expense}
              period={period}
              room={room}
            />

            <ExpenseExceptionCard
              canApprove={phase ? isExpenseMutationPhase(phase) : false}
              expenseId={expense.id}
            />

            {canMutateExpense && !editingExpense ? (
              <View style={styles.expenseActions}>
                <PrimaryButton
                  label="내 지출 수정"
                  onPress={() => {
                    setExpenseError(null);
                    setEditingExpense(true);
                  }}
                  style={styles.flexButton}
                  variant="secondary"
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

            <FormMessage message={expenseError} style={styles.threadError} />
          </>
        }
        phase={phase}
        profilesById={profilesById}
        toggleCommentReaction={toggleCommentReaction}
        updateComment={updateComment}
      />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  readOnlyBanner: { marginBottom: spacing.md },
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
    backgroundColor: palette.paper,
  },
  threadError: {
    color: palette.danger,
    fontFamily: fonts.hand,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
