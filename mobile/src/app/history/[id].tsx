import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExpenseCard } from "@/components/expense/expense-card";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassSurface } from "@/components/ui/glass-surface";
import { KeyValueRow } from "@/components/ui/key-value-row";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { PageHeader } from "@/components/ui/page-header";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { SectionHeader } from "@/components/ui/section-header";
import { palette, radii, spacing } from "@/constants/design";
import { createPeriodTimeline } from "@/domain";
import { useAppData } from "@/providers/app-provider";
import { formatDateLabel, formatWon } from "@/utils/format";

export default function HistoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const periodId = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    currentUser,
    getComments,
    getExpenses,
    getMembers,
    getPeriod,
    getProfile,
    getResults,
    getRoom,
  } = useAppData();
  const period = periodId ? getPeriod(periodId) : undefined;
  const room = period ? getRoom(period.roomId) : undefined;

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

  const expenses = [...getExpenses(period.id)].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const timeline = createPeriodTimeline(period.weekStart);
  const results = getResults(period.id);
  const membersByUserId = new Map(
    getMembers(period.id).map((member) => [member.userId, member]),
  );
  const memberResults = results.map((result) => ({
    result,
    member: membersByUserId.get(result.userId),
    profile: getProfile(result.userId),
  }));
  const crownIds = results
    .filter((result) => result.isCrown)
    .map((result) => result.userId);
  const myResult = memberResults.find(
    (row) => row.result.userId === currentUser?.id,
  );
  const settledResults = memberResults.filter(
    (row) => !row.member || row.member.status === "ACTIVE",
  );
  const everyoneAchieved =
    settledResults.length > 0 &&
    settledResults.every((row) => row.result.achieved);

  return (
    <Screen testID="history-detail-screen">
      <PageHeader onBack={() => router.back()} title="지난 주차" />

      <NoticeBanner icon="archive-lock-outline" style={styles.readOnlyBanner}>
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
              color={myResult?.result.achieved ? palette.green : palette.danger}
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
          {myResult && crownIds.includes(myResult.result.userId) ? (
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
        <Stat label="내 지출" value={formatWon(myResult?.result.spentAmount ?? 0)} />
        <View style={styles.statLine} />
        <Stat label="전체 완주" value={everyoneAchieved ? "성공" : "미달성"} />
      </View>

      <GlassSurface style={styles.rules} testID="archived-rule-snapshot">
        <SectionHeader style={styles.sectionHeading} title="고정 조건과 정산 기준" />
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
        <KeyValueRow label="공휴일 데이터" value={period.holidayVersionId} />
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
                index === memberResults.length - 1 && styles.memberRowLast,
              ]}
            >
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {row.profile?.avatar ?? "🙂"}
                </Text>
              </View>
              <View style={styles.memberCopy}>
                <View style={styles.memberNameRow}>
                  <Text numberOfLines={1} style={styles.memberName}>
                    {crownIds.includes(row.result.userId) ? "👑 " : ""}
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
                  {row.member?.eligibleDayCount ?? period.validDayCount}일 ÷{" "}
                  {period.selectedDayCount}일 ={" "}
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
        <View style={styles.expenses}>
          {expenses.map((expense) => {
            const profile = getProfile(expense.userId);
            const comments = getComments(expense.id);
            return (
              <View key={expense.id} style={styles.expenseRecord}>
                <ExpenseCard
                  amount={expense.amount}
                  avatar={profile?.avatar ?? "🙂"}
                  category={expense.category}
                  commentCount={
                    comments.filter((comment) => !comment.deletedAt).length
                  }
                  edited={expense.createdAt !== expense.updatedAt}
                  id={expense.id}
                  memo={expense.memo}
                  nickname={`${crownIds.includes(expense.userId) ? "👑 " : ""}${profile?.nickname ?? "알 수 없음"}`}
                  occurredAtLabel={formatDateLabel(expense.occurredAt)}
                  onPress={(id) => router.push(`/expense/${id}`)}
                  photoUri={expense.photoUri ?? ""}
                />
                {comments.length ? (
                  <View style={styles.commentPreview}>
                    {comments.slice(0, 3).map((comment) => (
                      <View key={comment.id} style={styles.previewComment}>
                        <Text style={styles.previewAuthor}>
                          {getProfile(comment.userId)?.nickname ?? "알 수 없음"}
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
                      onPress={() => router.push(`/expense/${expense.id}`)}
                      style={styles.openThread}
                    >
                      <Text style={styles.openThreadText}>
                        읽기 전용 대화 전체 보기
                      </Text>
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
          })}
          {!expenses.length ? (
            <EmptyState title="보관된 지출이 없어요." variant="compact" />
          ) : null}
        </View>
      </View>
    </Screen>
  );
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
  readOnlyBanner: { marginBottom: spacing.md },
  hero: {
    padding: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: palette.green,
  },
  heroTitle: {
    color: palette.cream,
    fontSize: 25,
    fontWeight: "800",
    marginTop: 5,
  },
  heroPeriod: { color: "rgba(253,246,227,0.72)", fontSize: 11, marginTop: 5 },
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
  heroResultLabel: { color: "rgba(253,246,227,0.70)", fontSize: 10 },
  heroResultValue: {
    color: palette.cream,
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
  statLabel: { color: palette.muted, fontSize: 9 },
  statValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
    maxWidth: "92%",
  },
  statLine: { width: StyleSheet.hairlineWidth, backgroundColor: palette.line },
  rules: {
    padding: spacing.xl,
    marginTop: spacing.xxl,
    backgroundColor: "rgba(255,253,247,0.68)",
  },
  sectionHeading: { marginBottom: spacing.md },
  holidayBox: {
    padding: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: "rgba(240,185,46,0.12)",
  },
  holidayTitle: { color: palette.ink, fontSize: 10, fontWeight: "700" },
  holidayDates: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
  },
  memberSection: { marginTop: spacing.xxxl },
  memberList: {
    paddingHorizontal: spacing.lg,
    backgroundColor: "rgba(255,253,247,0.62)",
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
  memberAvatar: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: palette.cream,
  },
  memberAvatarText: { fontSize: 21 },
  memberCopy: { flex: 1, minWidth: 0 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  memberName: {
    color: palette.ink,
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
  lateText: { color: palette.coralText, fontSize: 8, fontWeight: "700" },
  memberCalculation: { color: palette.muted, fontSize: 9, marginTop: 5 },
  memberJoin: { color: palette.muted, fontSize: 9, marginTop: 3 },
  memberAmount: { alignItems: "flex-end" },
  memberRemaining: { color: palette.success, fontSize: 17, fontWeight: "700" },
  memberRemainingOver: { color: palette.danger },
  memberAmountLabel: { color: palette.muted, fontSize: 9, marginTop: 2 },
  expenseSection: { marginTop: spacing.xxxl },
  expenses: { gap: spacing.xl },
  expenseRecord: { gap: 0 },
  commentPreview: {
    padding: spacing.md,
    marginHorizontal: spacing.sm,
    borderBottomLeftRadius: radii.md,
    borderBottomRightRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  previewComment: { flexDirection: "row", gap: spacing.sm, paddingVertical: 4 },
  previewAuthor: {
    color: palette.green,
    width: 58,
    fontSize: 10,
    fontWeight: "700",
  },
  previewBody: { color: palette.ink, flex: 1, fontSize: 10 },
  moreComments: { color: palette.muted, fontSize: 9, marginTop: 4 },
  openThread: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
  },
  openThreadText: { color: palette.green, fontSize: 10, fontWeight: "700" },
});
