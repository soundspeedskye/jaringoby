import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";

import { useExpenseComments } from "@/entities/expense/api/use-expense-comments";
import { usePeriodExpenses } from "@/entities/expense/api/use-expenses";
import { ExpenseCard } from "@/entities/expense/ui/expense-card";
import { useCurrentUser, useProfiles } from "@/entities/member/api/use-members";
import {
  usePeriod,
  usePeriodMembers,
  usePeriodResults,
} from "@/entities/period/api/use-periods";
import { useRoom } from "@/entities/room/api/use-rooms";
import type { Expense } from "@/shared/api/types";
import {
  fonts,
  palette,
  radii,
  spacing,
  tabularNums,
} from "@/shared/config/design";
import {
  compareLocalDates,
  toInstantMs,
  toSeoulLocalDate,
} from "@/shared/lib/domain/date-time";
import { createPeriodTimeline } from "@/shared/lib/domain/period";
import {
  formatDateLabel,
  formatLocalDateWithWeekday,
  formatTimeLabel,
  formatWon,
} from "@/shared/lib/format";
import { useAppActions } from "@/shared/providers/app-actions-provider";
import { useAppDialog } from "@/shared/providers/app-dialog-provider";
import { AnimalAvatar } from "@/shared/ui/animal-avatar";
import { EmptyState } from "@/shared/ui/empty-state";
import { GlassSurface } from "@/shared/ui/glass-surface";
import { KeyValueRow } from "@/shared/ui/key-value-row";
import { NoticeBanner } from "@/shared/ui/notice-banner";
import { PageHeader } from "@/shared/ui/page-header";
import { PrimaryButton } from "@/shared/ui/primary-button";
import { Screen, ScreenFrame } from "@/shared/ui/screen";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { SectionHeader } from "@/shared/ui/section-header";

export function HistoryDetailPage() {
  const router = useRouter();
  const { id: periodId } = useLocalSearchParams<"/history/[id]">();
  const currentUser = useCurrentUser();
  const { deleteArchivedPeriod } = useAppActions();
  const { showDialog } = useAppDialog();
  const period = usePeriod(periodId);
  const room = useRoom(period?.roomId);
  const periodExpenses = usePeriodExpenses(periodId);
  const periodMembers = usePeriodMembers(periodId);
  const results = usePeriodResults(periodId);
  const profileUserIds = useMemo(
    () => [
      ...periodMembers.map((member) => member.userId),
      ...results.map((result) => result.userId),
    ],
    [periodMembers, results],
  );
  const profilesById = useProfiles(profileUserIds);
  const expenses = useMemo(
    () =>
      [...periodExpenses].sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      ),
    [periodExpenses],
  );
  const timeline = useMemo(
    () => (period ? createPeriodTimeline(period.weekStart) : null),
    [period],
  );
  const { crownIdSet, everyoneAchieved, memberResults, myResult } =
    useMemo(() => {
      const membersByUserId = new Map(
        periodMembers.map((member) => [member.userId, member]),
      );
      const nextMemberResults = results.map((result) => ({
        result,
        member: membersByUserId.get(result.userId),
        profile: profilesById.get(result.userId),
      }));
      const nextCrownIdSet = new Set(
        results
          .filter((result) => result.isCrown)
          .map((result) => result.userId),
      );
      const settledResults = nextMemberResults.filter(
        (row) => !row.member || row.member.status === "ACTIVE",
      );
      return {
        crownIdSet: nextCrownIdSet,
        everyoneAchieved:
          settledResults.length > 0 &&
          settledResults.every((row) => row.result.achieved),
        memberResults: nextMemberResults,
        myResult: nextMemberResults.find(
          (row) => row.result.userId === currentUser?.id,
        ),
      };
    }, [currentUser?.id, periodMembers, profilesById, results]);
  // 보관된 지출을 발생일(서울 기준)로 묶는다. 날짜도, 하루 안의 기록도 최신순이다.
  const expenseDays = useMemo(() => {
    const byDate = new Map<string, Expense[]>();
    for (const expense of expenses) {
      const date = toSeoulLocalDate(expense.occurredAt);
      const bucket = byDate.get(date);
      if (bucket) bucket.push(expense);
      else byDate.set(date, [expense]);
    }
    return [...byDate.entries()]
      .sort(([left], [right]) => compareLocalDates(right, left))
      .map(([date, dayExpenses]) => ({
        date,
        expenses: [...dayExpenses].sort(
          (left, right) =>
            toInstantMs(right.occurredAt) - toInstantMs(left.occurredAt) ||
            toInstantMs(right.createdAt) - toInstantMs(left.createdAt),
        ),
        total: dayExpenses.reduce((sum, expense) => sum + expense.amount, 0),
      }));
  }, [expenses]);
  // 기본은 전부 접힘. 날짜 줄을 눌러야 그날의 기록이 펼쳐진다.
  const [expandedDates, setExpandedDates] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleDate = useCallback((date: string) => {
    setExpandedDates((current) => {
      const next = new Set(current);
      if (!next.delete(date)) next.add(date);
      return next;
    });
  }, []);
  const expenseSections = useMemo(
    () =>
      expenseDays.map((day) => {
        const expanded = expandedDates.has(day.date);
        return {
          ...day,
          expanded,
          key: day.date,
          data: expanded ? day.expenses : [],
        };
      }),
    [expandedDates, expenseDays],
  );
  const openExpense = useCallback(
    (expenseId: string) => router.push(`/expense/${expenseId}`),
    [router],
  );
  const canDeletePeriod = room?.ownerId === currentUser?.id;
  const confirmDeletePeriod = useCallback(() => {
    if (!period) return;
    showDialog(
      "지난 주차를 삭제할까요?",
      "이 주차의 지출, 댓글, 정산 결과와 첨부 사진이 모두 삭제되며 되돌릴 수 없어요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            void deleteArchivedPeriod(period.id)
              .then(() => router.replace("/history"))
              .catch(() => undefined);
          },
        },
      ],
    );
  }, [deleteArchivedPeriod, period, router, showDialog]);
  const renderArchivedExpense = useCallback(
    ({ item: expense }: { item: Expense }) => (
      <ArchivedExpenseRecord
        expense={expense}
        isCrowned={crownIdSet.has(expense.userId)}
        onOpen={openExpense}
      />
    ),
    [crownIdSet, openExpense],
  );
  const refreshControl = usePullToRefreshControl();
  const renderArchivedDay = useCallback(
    ({ section }: { section: ArchivedDaySection }) => (
      <ArchivedDayHeader
        count={section.expenses.length}
        date={section.date}
        expanded={section.expanded}
        onToggle={toggleDate}
        total={section.total}
      />
    ),
    [toggleDate],
  );

  if (!period) {
    return (
      <Screen testID="history-detail-screen">
        <PageHeader onBack={() => router.back()} title="지난 주차" />
        <EmptyState
          action={
            <PrimaryButton
              label="목록으로 돌아가기"
              onPress={() => router.replace("/history")}
              variant="secondary"
            />
          }
          icon="archive-remove-outline"
          title="지난 주차 기록을 찾을 수 없어요."
        />
      </Screen>
    );
  }

  if (!timeline) return null;

  return (
    <ScreenFrame
      fixedHeader={
        <PageHeader
          onBack={() => router.back()}
          right={
            canDeletePeriod ? (
              <Pressable
                accessibilityLabel="지난 주차 삭제"
                accessibilityRole="button"
                hitSlop={8}
                onPress={confirmDeletePeriod}
              >
                <Text style={styles.deletePeriodText}>삭제</Text>
              </Pressable>
            ) : undefined
          }
          title="지난 주차"
        />
      }
      testID="history-detail-screen"
    >
      <SectionList
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={ArchivedExpenseSeparator}
        keyExtractor={(expense) => expense.id}
        ListEmptyComponent={
          <EmptyState title="보관된 지출이 없어요." variant="compact" />
        }
        ListHeaderComponent={
          <>
            <NoticeBanner
              icon="archive-lock-outline"
              style={styles.readOnlyBanner}
            >
              정산 완료 · 읽기 전용
            </NoticeBanner>

            <View style={styles.hero}>
              <Text style={styles.heroTitle}>
                {room?.name ?? "방"} · {period.weekIndex}주차
              </Text>
              <Text style={styles.heroPeriod}>
                {period.weekStart} ~ {period.weekEnd}
              </Text>
              <View style={styles.heroResult}>
                <View
                  style={[
                    styles.resultIcon,
                    !myResult?.result.achieved && styles.resultIconOver,
                  ]}
                >
                  <MaterialCommunityIcons
                    color={
                      myResult?.result.achieved ? palette.green : palette.danger
                    }
                    name={
                      myResult?.result.achieved
                        ? "trophy-outline"
                        : "chart-line-variant"
                    }
                    size={27}
                  />
                </View>
                <View style={styles.heroResultCopy}>
                  <Text style={styles.heroResultLabel}>나의 주차 결과</Text>
                  <Text style={styles.heroResultValue}>
                    {myResult
                      ? myResult.result.achieved
                        ? `${formatWon(myResult.result.remainingAmount)} 남김`
                        : `${formatWon(Math.abs(myResult.result.remainingAmount))} 초과`
                      : "참여 결과 없음"}
                  </Text>
                </View>
                {myResult && crownIdSet.has(myResult.result.userId) ? (
                  <Text style={styles.crown}>👑</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.finalStats}>
              <Stat
                label="내 적용한도"
                value={formatWon(myResult?.result.appliedLimit ?? 0)}
              />
              <View style={styles.statLine} />
              <Stat
                label="내 지출"
                value={formatWon(myResult?.result.spentAmount ?? 0)}
              />
              <View style={styles.statLine} />
              <Stat
                label="전체 완주"
                value={everyoneAchieved ? "성공" : "미달성"}
              />
            </View>

            <GlassSurface style={styles.rules} testID="archived-rule-snapshot">
              <SectionHeader style={styles.sectionHeading} title="정산 기준" />
              <KeyValueRow
                label="주당 기준금액"
                value={formatWon(room?.baseAmount ?? 0)}
              />
              <KeyValueRow
                label="유효 평일"
                value={`${period.validDayCount}일 / ${period.selectedDayCount}일`}
              />
              <KeyValueRow
                label="제외 공휴일"
                value={`${period.holidayDates.length}일`}
              />
              <KeyValueRow
                label="보정 마감"
                value={formatDateLabel(new Date(timeline.C))}
              />
              <KeyValueRow
                label="최종 확정"
                value={formatDateLabel(new Date(timeline.F))}
              />
              {period.holidayDates.length ? (
                <View style={styles.holidayBox}>
                  <Text style={styles.holidayTitle}>제외된 날짜</Text>
                  <Text style={styles.holidayDates}>
                    {period.holidayDates.join(" · ")}
                  </Text>
                </View>
              ) : null}
            </GlassSurface>

            <View style={styles.memberSection}>
              <SectionHeader
                meta={`${memberResults.length}명`}
                style={styles.sectionHeading}
                title="참여자 정산 결과"
              />
              <GlassSurface style={styles.memberList}>
                {memberResults.map((row, index) => (
                  <View
                    key={row.result.userId}
                    style={[
                      styles.memberRow,
                      index === memberResults.length - 1 &&
                        styles.memberRowLast,
                    ]}
                  >
                    <AnimalAvatar
                      photoUri={row.profile?.avatarUri}
                      value={row.profile?.avatar}
                      size={42}
                      style={styles.memberAvatar}
                    />
                    <View style={styles.memberCopy}>
                      <View style={styles.memberNameRow}>
                        <Text numberOfLines={1} style={styles.memberName}>
                          {crownIdSet.has(row.result.userId) ? "👑 " : ""}
                          {row.result.userId === currentUser?.id
                            ? "나"
                            : (row.profile?.nickname ?? row.result.nickname)}
                        </Text>
                        {row.member?.isLateJoiner ? (
                          <View style={styles.lateBadge}>
                            <Text style={styles.lateText}>중도 합류</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.memberCalculation}>
                        {formatWon(room?.baseAmount ?? 0, false)} ×{" "}
                        {row.member?.eligibleDayCount ?? period.validDayCount}일
                        ÷ {period.selectedDayCount}일 ={" "}
                        {formatWon(row.result.appliedLimit)}
                      </Text>
                      <Text style={styles.memberJoin}>
                        {row.member ? `${row.member.joinedDate} 합류 · ` : ""}
                        {!row.member || row.member.status === "ACTIVE"
                          ? "최종 참여"
                          : "참여 종료"}
                      </Text>
                    </View>
                    <View style={styles.memberAmount}>
                      <Text
                        style={[
                          styles.memberRemaining,
                          !row.result.achieved && styles.memberRemainingOver,
                        ]}
                      >
                        {formatWon(Math.abs(row.result.remainingAmount), false)}
                      </Text>
                      <Text style={styles.memberAmountLabel}>
                        {row.result.remainingAmount >= 0 ? "남음" : "초과"}
                      </Text>
                    </View>
                  </View>
                ))}
                {!memberResults.length ? (
                  <EmptyState
                    title={
                      period.isRestWeek
                        ? "공휴일만 있는 쉬는 주였어요."
                        : "정산 결과가 없어요."
                    }
                    variant="compact"
                  />
                ) : null}
              </GlassSurface>
            </View>

            <View style={styles.expenseSection}>
              <SectionHeader
                meta={`${expenses.length}건`}
                style={styles.sectionHeading}
                title="보관된 지출과 대화"
              />
            </View>
          </>
        }
        refreshControl={refreshControl}
        renderItem={renderArchivedExpense}
        renderSectionHeader={renderArchivedDay}
        sections={expenseSections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </ScreenFrame>
  );
}

type ArchivedDaySection = {
  date: string;
  expenses: Expense[];
  expanded: boolean;
  total: number;
};

// 하루치를 접었다 펴는 줄. 접힌 상태에서도 건수와 그날 합계는 읽히게 남긴다.
const ArchivedDayHeader = memo(function ArchivedDayHeader({
  count,
  date,
  expanded,
  onToggle,
  total,
}: {
  count: number;
  date: string;
  expanded: boolean;
  onToggle: (date: string) => void;
  total: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={() => onToggle(date)}
      style={[styles.dayHeader, expanded && styles.dayHeaderExpanded]}
    >
      <View style={styles.dayCopy}>
        <Text style={styles.dayTitle}>{formatLocalDateWithWeekday(date)}</Text>
        <Text style={styles.dayCount}>{count}건</Text>
      </View>
      <Text style={styles.dayTotal}>{formatWon(total)}</Text>
      <MaterialCommunityIcons
        color={palette.muted}
        name={expanded ? "chevron-up" : "chevron-down"}
        size={20}
      />
    </Pressable>
  );
});

const ArchivedExpenseRecord = memo(function ArchivedExpenseRecord({
  expense,
  isCrowned,
  onOpen,
}: {
  expense: Expense;
  isCrowned: boolean;
  onOpen: (expenseId: string) => void;
}) {
  const comments = useExpenseComments(expense.id);
  const profileUserIds = useMemo(
    () => [expense.userId, ...comments.map((comment) => comment.userId)],
    [comments, expense.userId],
  );
  const profilesById = useProfiles(profileUserIds);
  const profile = profilesById.get(expense.userId);

  return (
    <View style={styles.expenseRecord}>
      <ExpenseCard
        amount={expense.amount}
        pointAmount={expense.pointAmount}
        avatar={profile?.avatar ?? ""}
        category={expense.category}
        commentCount={comments.filter((comment) => !comment.deletedAt).length}
        edited={expense.createdAt !== expense.updatedAt}
        id={expense.id}
        memo={expense.memo}
        nickname={`${isCrowned ? "👑 " : ""}${profile?.nickname ?? "알 수 없음"}`}
        occurredAtLabel={formatTimeLabel(expense.occurredAt)}
        onPress={onOpen}
        photoPath={expense.photoPath}
        photoThumbnailUri={expense.photoThumbnailUri}
        photoUri={expense.photoUri}
      />
      {comments.length ? (
        <View style={styles.commentPreview}>
          {comments.slice(0, 3).map((comment) => (
            <View key={comment.id} style={styles.previewComment}>
              <Text style={styles.previewAuthor}>
                {profilesById.get(comment.userId)?.nickname ?? "알 수 없음"}
              </Text>
              <Text numberOfLines={1} style={styles.previewBody}>
                {comment.deletedAt ? "삭제된 메시지" : comment.body}
              </Text>
            </View>
          ))}
          {comments.length > 3 ? (
            <Text style={styles.moreComments}>
              댓글 {comments.length - 3}개 더 보기
            </Text>
          ) : null}
          <Pressable
            onPress={() => onOpen(expense.id)}
            style={styles.openThread}
          >
            <Text style={styles.openThreadText}>읽기 전용 대화 전체 보기</Text>
            <MaterialCommunityIcons
              color={palette.green}
              name="chevron-right"
              size={17}
            />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

function ArchivedExpenseSeparator() {
  return <View style={styles.expenseSeparator} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  readOnlyBanner: { marginBottom: spacing.md },
  deletePeriodText: {
    color: palette.danger,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
  },
  hero: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: palette.green,
  },
  heroTitle: {
    color: palette.cream,
    fontFamily: fonts.hand,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 5,
  },
  heroPeriod: {
    color: "rgba(253,246,227,0.72)",
    fontFamily: fonts.hand,
    fontSize: 11,
    marginTop: 5,
    ...tabularNums,
  },
  heroResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    marginTop: spacing.xl,
    borderRadius: radii.md,
    backgroundColor: "rgba(253,246,227,0.12)",
  },
  resultIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: palette.yellow,
  },
  resultIconOver: { backgroundColor: palette.cream },
  heroResultCopy: { flex: 1 },
  heroResultLabel: {
    color: "rgba(253,246,227,0.70)",
    fontFamily: fonts.hand,
    fontSize: 10,
  },
  heroResultValue: {
    color: palette.cream,
    fontFamily: fonts.handBold,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },
  crown: { fontSize: 27 },
  finalStats: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: spacing.lg,
    marginTop: -2,
    marginHorizontal: spacing.md,
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
    backgroundColor: palette.paper,
  },
  stat: { flex: 1, alignItems: "center", minWidth: 0 },
  statLabel: { color: palette.muted, fontFamily: fonts.hand, fontSize: 9 },
  statValue: {
    color: palette.ink,
    fontFamily: fonts.number,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
    maxWidth: "92%",
    ...tabularNums,
  },
  statLine: { width: StyleSheet.hairlineWidth, backgroundColor: palette.line },
  rules: {
    padding: spacing.xl,
    marginTop: spacing.xxl,
    backgroundColor: palette.paper,
  },
  sectionHeading: { marginBottom: spacing.md },
  holidayBox: {
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(240,185,46,0.12)",
  },
  holidayTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 10,
    fontWeight: "700",
  },
  holidayDates: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
    ...tabularNums,
  },
  memberSection: { marginTop: spacing.xxxl },
  memberList: {
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.paper,
  },
  memberRow: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  memberRowLast: { borderBottomWidth: 0 },
  memberAvatar: {},
  memberCopy: { flex: 1, minWidth: 0 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  memberName: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  lateBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: "rgba(233,135,98,0.12)",
  },
  lateText: {
    color: palette.coralText,
    fontFamily: fonts.handBold,
    fontSize: 8,
    fontWeight: "700",
  },
  memberCalculation: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 9,
    marginTop: 5,
    ...tabularNums,
  },
  memberJoin: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 9,
    marginTop: 3,
    ...tabularNums,
  },
  memberAmount: { alignItems: "flex-end" },
  memberRemaining: {
    color: palette.success,
    fontFamily: fonts.number,
    fontSize: 17,
    fontWeight: "700",
    ...tabularNums,
  },
  memberRemainingOver: { color: palette.danger },
  memberAmountLabel: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 9,
    marginTop: 2,
  },
  expenseSection: { marginTop: spacing.xxxl },
  expenseSeparator: { height: spacing.md },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.lg,
    backgroundColor: palette.paper,
  },
  dayHeaderExpanded: { marginBottom: spacing.md },
  dayCopy: { flex: 1, minWidth: 0 },
  dayTitle: {
    color: palette.ink,
    fontFamily: fonts.handBold,
    fontSize: 13,
    fontWeight: "700",
  },
  dayCount: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 10,
    marginTop: 3,
  },
  dayTotal: {
    color: palette.ink,
    fontFamily: fonts.number,
    fontSize: 14,
    fontWeight: "700",
    ...tabularNums,
  },
  expenseRecord: { gap: 0 },
  commentPreview: {
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    backgroundColor: palette.paper,
  },
  previewComment: { flexDirection: "row", gap: spacing.sm, paddingVertical: 4 },
  previewAuthor: {
    color: palette.green,
    fontFamily: fonts.handBold,
    width: 58,
    fontSize: 10,
    fontWeight: "700",
  },
  previewBody: {
    color: palette.ink,
    fontFamily: fonts.hand,
    flex: 1,
    fontSize: 10,
  },
  moreComments: {
    color: palette.muted,
    fontFamily: fonts.hand,
    fontSize: 9,
    marginTop: 4,
  },
  openThread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
  },
  openThreadText: {
    color: palette.green,
    fontFamily: fonts.handBold,
    fontSize: 10,
    fontWeight: "700",
  },
});
