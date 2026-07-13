import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ExpenseCard } from "@/components/expense/expense-card";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import { createChallengeTimeline, selectCrownHolders } from "@/domain";
import { useAppData } from "@/providers/app-provider";
import { formatDateLabel, formatWon } from "@/utils/format";

export default function HistoryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const challengeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const {
    currentUser,
    getChallenge,
    getComments,
    getExpenses,
    getMembers,
    getProfile,
    getUserExpenses,
  } = useAppData();
  const challenge = challengeId ? getChallenge(challengeId) : undefined;

  if (!challenge) {
    return (
      <Screen testID="history-detail-screen">
        <Header onBack={() => router.back()} />
        <View style={styles.notFound}>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="archive-remove-outline"
            size={44}
          />
          <Text style={styles.notFoundTitle}>지난 기록을 찾을 수 없어요.</Text>
          <PrimaryButton
            label="목록으로 돌아가기"
            onPress={() => router.replace("/history")}
            variant="secondary"
          />
        </View>
      </Screen>
    );
  }

  const members = getMembers(challenge.id);
  const expenses = [...getExpenses(challenge.id)].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const timeline = createChallengeTimeline({
    startDate: challenge.startDate,
    endDate: challenge.endDate,
  });
  const memberResults = members.map((member) => {
    const spent = getUserExpenses(member.userId, challenge.id)
      .reduce((sum, expense) => sum + expense.amount, 0);
    return {
      member,
      profile: getProfile(member.userId),
      spent,
      remaining: member.appliedLimit - spent,
      achieved: spent <= member.appliedLimit,
    };
  });
  const crownIds = selectCrownHolders(
    memberResults.map((result) => ({
      memberId: result.member.userId,
      nickname: result.profile?.nickname ?? "알 수 없음",
      status: result.member.status,
      appliedLimit: result.member.appliedLimit,
      eligibleSpending: result.spent,
    })),
    "ARCHIVED",
  ).holderIds;
  const myResult = memberResults.find(
    (result) => result.member.userId === currentUser?.id,
  );
  const activeResults = memberResults.filter(
    (result) => result.member.status === "ACTIVE",
  );
  const everyoneAchieved =
    activeResults.length > 0 &&
    activeResults.every((result) => result.achieved);

  return (
    <Screen testID="history-detail-screen">
      <Header onBack={() => router.back()} />

      <View style={styles.readOnlyBanner}>
        <MaterialCommunityIcons
          color={palette.green}
          name="archive-lock-outline"
          size={20}
        />
        <Text style={styles.readOnlyTitle}>정산 완료 · 읽기 전용</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{challenge.name}</Text>
        <Text style={styles.heroPeriod}>
          {challenge.startDate} ~ {challenge.endDate}
        </Text>
        <View style={styles.heroResult}>
          <View
            style={[
              styles.resultIcon,
              !myResult?.achieved && styles.resultIconOver,
            ]}
          >
            <MaterialCommunityIcons
              color={myResult?.achieved ? palette.green : palette.danger}
              name={
                myResult?.achieved ? "trophy-outline" : "chart-line-variant"
              }
              size={27}
            />
          </View>
          <View style={styles.heroResultCopy}>
            <Text style={styles.heroResultLabel}>나의 최종 결과</Text>
            <Text style={styles.heroResultValue}>
              {myResult
                ? myResult.achieved
                  ? `${formatWon(myResult.remaining)} 남김`
                  : `${formatWon(Math.abs(myResult.remaining))} 초과`
                : "참여 결과 없음"}
            </Text>
          </View>
          {myResult && crownIds.includes(myResult.member.userId) ? (
            <Text style={styles.crown}>👑</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.finalStats}>
        <Stat
          label="내 적용한도"
          value={formatWon(myResult?.member.appliedLimit ?? 0)}
        />
        <View style={styles.statLine} />
        <Stat label="내 지출" value={formatWon(myResult?.spent ?? 0)} />
        <View style={styles.statLine} />
        <Stat label="전체 완주" value={everyoneAchieved ? "성공" : "미달성"} />
      </View>

      <GlassSurface style={styles.rules} testID="archived-rule-snapshot">
        <Text style={styles.sectionTitle}>고정 조건과 정산 기준</Text>
        <RuleRow label="기준금액" value={formatWon(challenge.baseLimit)} />
        <RuleRow
          label="전체 선택일"
          value={`${challenge.selectedDates.length}일`}
        />
        <RuleRow
          label="제외 공휴일"
          value={`${challenge.holidayDates.length}일`}
        />
        <RuleRow
          label="공휴일 데이터"
          value={challenge.holidaySnapshotVersion}
        />
        <RuleRow
          label="보정 마감"
          value={formatDateLabel(new Date(timeline.C))}
        />
        <RuleRow
          label="최종 확정"
          value={formatDateLabel(new Date(timeline.F))}
        />
        {challenge.holidayDates.length ? (
          <View style={styles.holidayBox}>
            <Text style={styles.holidayTitle}>제외된 날짜</Text>
            <Text style={styles.holidayDates}>
              {challenge.holidayDates.join(" · ")}
            </Text>
          </View>
        ) : null}
      </GlassSurface>

      <View style={styles.memberSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>참여자 최종 결과</Text>
          <Text style={styles.sectionCount}>{activeResults.length}명</Text>
        </View>
        <GlassSurface style={styles.memberList}>
          {memberResults.map((result, index) => (
            <View
              key={result.member.userId}
              style={[
                styles.memberRow,
                index === memberResults.length - 1 && styles.memberRowLast,
              ]}
            >
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {result.profile?.avatar ?? "🙂"}
                </Text>
              </View>
              <View style={styles.memberCopy}>
                <View style={styles.memberNameRow}>
                  <Text numberOfLines={1} style={styles.memberName}>
                    {crownIds.includes(result.member.userId) ? "👑 " : ""}
                    {result.member.userId === currentUser?.id
                      ? "나"
                      : (result.profile?.nickname ?? "알 수 없음")}
                  </Text>
                  {result.member.isLateJoiner ? (
                    <View style={styles.lateBadge}>
                      <Text style={styles.lateText}>중도 합류</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.memberCalculation}>
                  {formatWon(challenge.baseLimit, false)} ×{" "}
                  {countRemainingDays(
                    challenge.selectedDates,
                    challenge.holidayDates,
                    result.member.joinedDate,
                  )}
                  일 ÷ {challenge.selectedDates.length}일 ={" "}
                  {formatWon(result.member.appliedLimit)}
                </Text>
                <Text style={styles.memberJoin}>
                  {result.member.joinedDate} 합류 ·{" "}
                  {result.member.status === "ACTIVE"
                    ? "최종 참여"
                    : "참여 종료"}
                </Text>
              </View>
              <View style={styles.memberAmount}>
                <Text
                  style={[
                    styles.memberRemaining,
                    !result.achieved && styles.memberRemainingOver,
                  ]}
                >
                  {formatWon(Math.abs(result.remaining), false)}
                </Text>
                <Text style={styles.memberAmountLabel}>
                  {result.remaining >= 0 ? "남음" : "초과"}
                </Text>
              </View>
            </View>
          ))}
        </GlassSurface>
      </View>

      <View style={styles.expenseSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>보관된 지출과 대화</Text>
          <Text style={styles.sectionCount}>{expenses.length}건</Text>
        </View>
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
            <Text style={styles.noExpenses}>보관된 지출이 없어요.</Text>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
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
      <Text style={styles.title}>지난 기록</Text>
    </View>
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

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.ruleValue}>
        {value}
      </Text>
    </View>
  );
}

function countRemainingDays(
  selectedDates: string[],
  holidays: string[],
  joinedDate: string,
): number {
  return selectedDates.filter(
    (date) => date >= joinedDate && !holidays.includes(date),
  ).length;
}

const styles = StyleSheet.create({
  header: {
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
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(47,113,93,0.10)",
  },
  readOnlyTitle: { flex: 1, color: palette.green, fontSize: 12, fontWeight: "700" },
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
  sectionTitle: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 3,
    marginBottom: spacing.md,
  },
  ruleRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  ruleLabel: { color: palette.muted, fontSize: 11 },
  ruleValue: {
    color: palette.ink,
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
  },
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionCount: {
    color: palette.muted,
    fontSize: 11,
    marginBottom: spacing.md,
  },
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
  noExpenses: {
    color: palette.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: spacing.xxl,
  },
  notFound: { alignItems: "center", gap: spacing.md, paddingTop: 100 },
  notFoundTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
});
