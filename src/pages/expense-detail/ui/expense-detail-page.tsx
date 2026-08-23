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
  useExpenseComments,
  useReactionsByCommentId,
} from "@/entities/expense/api/use-expense-comments";
import { useExpense } from "@/entities/expense/api/use-expenses";
import { useProfiles } from "@/entities/member/api/use-members";
import { usePeriod } from "@/entities/period/api/use-periods";
import { useRoom } from "@/entities/room/api/use-rooms";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { useCurrentRoom } from "@/shared/providers/app-data-hooks";
import { EmptyState } from "@/shared/ui/empty-state";
import { FormMessage } from "@/shared/ui/form-message";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PageHeader } from "@/shared/ui/page-header";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { Screen, ScreenFrame } from "@/shared/ui/screen";
import { CommentThread, type ThreadFeatures, type ThreadMessage } from "@/widgets/comment-thread";

const EXPENSE_COMMENT_FEATURES: ThreadFeatures = {
  replies: true,
  reactions: true,
  maxLength: 500,
  placeholder: "응원이나 피드백을 남겨요",
};

export function ExpenseDetailPage() {
  const router = useRouter();
  const { showDialog } = useAppDialog();
  const {
    id: expenseId,
    rid: requestId,
    cid: highlightCommentId,
  } = useLocalSearchParams<"/expense/[id]", { rid?: string; cid?: string }>();
  const {
    addComment,
    deleteComment,
    deleteExpense,
    toggleCommentReaction,
    updateComment,
    updateExpense,
  } = useAppActions();
  const { currentPeriod, currentUser } = useCurrentRoom();
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
  const threadMessages = useMemo<ThreadMessage[]>(
    () => comments.map((comment) => ({
      id: comment.id,
      authorId: comment.userId,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      deletedAt: comment.deletedAt,
      syncStatus: comment.syncStatus,
      replyToId: comment.replyToId,
    })),
    [comments],
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
  // 헤더·안드로이드 뒤로가기를 스와이프 뒤로가기와 같은 의미로 맞춘다: 온 곳으로
  // 돌아간다. 새 지출은 작성 폼 라우트를 이 상세로 replace하고 알림 콜드스타트는
  // 이 상세를 첫 화면으로 띄우므로 돌아갈 히스토리가 없을 수 있다. 그때만 지출이
  // 속한 주차 화면으로 보낸다: 진행 중이면 홈, 아니면 그 지난 주차 화면.
  const returnFromExpense = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.dismissTo(
      period && period.id !== currentPeriod?.id ? `/history/${period.id}` : "/",
    );
  }, [currentPeriod?.id, period, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        returnFromExpense();
        return true;
      },
    );
    return () => subscription.remove();
  }, [returnFromExpense]);

  if (!expense || !expenseId) {
    return (
      <Screen testID="expense-detail-screen">
        <PageHeader onBack={returnFromExpense} title="지출 상세" />
        <EmptyState
          action={
            <PrimaryButton
              label="뒤로 가기"
              onPress={returnFromExpense}
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
                returnFromExpense();
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
    <ScreenFrame
      fixedHeader={<PageHeader onBack={returnFromExpense} title="지출 상세" />}
      testID="expense-detail-screen">
      <CommentThread
        actions={{
          create: (input) => addComment({ ...input, expenseId: expense.id }),
          update: updateComment,
          remove: deleteComment,
          toggleReaction: toggleCommentReaction,
        }}
        canDelete={(comment) => comment.authorId === currentUser?.id}
        canEdit={(comment) => comment.authorId === currentUser?.id}
        canMutate={canMutateComments}
        comments={threadMessages}
        currentUserId={currentUser?.id}
        highlightCommentId={highlightCommentId}
        features={EXPENSE_COMMENT_FEATURES}
        reactionsByCommentId={reactionsByCommentId}
        header={
          <>
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
