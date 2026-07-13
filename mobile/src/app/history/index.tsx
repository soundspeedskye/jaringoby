import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { GlassSurface } from "@/components/ui/glass-surface";
import { Screen } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import type { Challenge } from "@/data/types";
import { useAppData } from "@/providers/app-provider";
import { formatWon } from "@/utils/format";

type ResultFilter = "전체" | "달성" | "초과";

export default function HistoryScreen() {
  const router = useRouter();
  const { archivedChallenges, currentUser, getMembers, getUserExpenses } =
    useAppData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("전체");
  const deferredQuery = useDeferredValue(query);

  const baseRecords = useMemo(
    () =>
      archivedChallenges
        .map((challenge) => {
          const member = getMembers(challenge.id).find(
            (item) => item.userId === currentUser?.id,
          );
          if (!member) return null;
          const expenses = currentUser
            ? getUserExpenses(currentUser.id, challenge.id)
            : [];
          const spent = expenses.reduce(
            (sum, expense) => sum + expense.amount,
            0,
          );
          return {
            challenge,
            member,
            spent,
            remaining: member.appliedLimit - spent,
            achieved: spent <= member.appliedLimit,
            expenseCount: expenses.length,
          };
        })
        .filter((record): record is NonNullable<typeof record> =>
          Boolean(record),
        )
        .sort((left, right) =>
          right.challenge.endDate.localeCompare(left.challenge.endDate),
        ),
    [archivedChallenges, currentUser, getMembers, getUserExpenses],
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = deferredQuery
      .trim()
      .toLocaleLowerCase("ko-KR");
    return baseRecords
        .filter((record) =>
          record.challenge.name
            .toLocaleLowerCase("ko-KR")
          .includes(normalizedQuery),
        )
        .filter(
          (record) =>
            filter === "전체" ||
            (filter === "달성" ? record.achieved : !record.achieved),
        );
  }, [baseRecords, deferredQuery, filter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filteredRecords>();
    filteredRecords.forEach((record) => {
      const month = record.challenge.endDate.slice(0, 7);
      const monthRecords = groups.get(month);
      if (monthRecords) monthRecords.push(record);
      else groups.set(month, [record]);
    });
    return [...groups.entries()];
  }, [filteredRecords]);
  const openChallenge = useCallback(
    (challengeId: string) => router.push(`/history/${challengeId}`),
    [router],
  );

  return (
    <Screen testID="challenge-history-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="뒤로"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialCommunityIcons
            color={palette.green}
            name="chevron-left"
            size={26}
          />
        </Pressable>
        <Text style={styles.title}>지난 챌린지</Text>
        <View style={styles.archiveIcon}>
          <MaterialCommunityIcons
            color={palette.yellow}
            name="archive-check-outline"
            size={23}
          />
        </View>
      </View>

      <View style={styles.searchBox}>
        <MaterialCommunityIcons
          color={palette.greenSoft}
          name="magnify"
          size={20}
        />
        <TextInput
          accessibilityLabel="챌린지명 검색"
          onChangeText={setQuery}
          placeholder="챌린지명 검색"
          placeholderTextColor={palette.muted}
          style={styles.searchInput}
          value={query}
        />
        {query ? (
          <Pressable
            accessibilityLabel="검색어 지우기"
            onPress={() => setQuery("")}
          >
            <MaterialCommunityIcons
              color={palette.muted}
              name="close-circle"
              size={18}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filters}>
        {(["전체", "달성", "초과"] as ResultFilter[]).map((item) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: filter === item }}
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterSelected]}
          >
            <Text
              style={[
                styles.filterText,
                filter === item && styles.filterTextSelected,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      {grouped.length ? (
        grouped.map(([month, monthRecords]) => (
          <View key={month} style={styles.monthGroup}>
            <View style={styles.monthHeader}>
              <Text style={styles.monthTitle}>{formatMonth(month)}</Text>
              <Text style={styles.monthCount}>{monthRecords.length}개</Text>
            </View>
            <View style={styles.cards}>
              {monthRecords.map((record) => (
                <HistoryCard
                  achieved={record.achieved}
                  challenge={record.challenge}
                  expenseCount={record.expenseCount}
                  key={record.challenge.id}
                  limit={record.member.appliedLimit}
                  onSelect={openChallenge}
                  remaining={record.remaining}
                  spent={record.spent}
                />
              ))}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.empty}>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="archive-search-outline"
            size={44}
          />
          <Text style={styles.emptyTitle}>
            {query || filter !== "전체"
              ? "조건에 맞는 기록이 없어요."
              : "아직 완료된 챌린지가 없어요."}
          </Text>
          <Text style={styles.emptyBody}>
            정산이 완료되면 이곳에 월별로 자동 보관돼요.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const HistoryCard = memo(function HistoryCard({
  challenge,
  limit,
  spent,
  remaining,
  achieved,
  expenseCount,
  onSelect,
}: {
  challenge: Challenge;
  limit: number;
  spent: number;
  remaining: number;
  achieved: boolean;
  expenseCount: number;
  onSelect: (challengeId: string) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onSelect(challenge.id)}
    >
      <GlassSurface interactive style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleGroup}>
            <View
              style={[styles.resultBadge, !achieved && styles.resultBadgeOver]}
            >
              <MaterialCommunityIcons
                color={achieved ? palette.success : palette.danger}
                name={
                  achieved ? "check-circle-outline" : "alert-circle-outline"
                }
                size={14}
              />
              <Text
                style={[styles.resultText, !achieved && styles.resultTextOver]}
              >
                {achieved ? "달성" : "초과"}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {challenge.name}
            </Text>
            <Text style={styles.cardPeriod}>
              {challenge.startDate} ~ {challenge.endDate}
            </Text>
          </View>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="chevron-right"
            size={22}
          />
        </View>
        <View style={styles.cardNumbers}>
          <NumberBlock label="내 적용한도" value={formatWon(limit)} />
          <View style={styles.verticalLine} />
          <NumberBlock label="사용" value={formatWon(spent)} />
          <View style={styles.verticalLine} />
          <NumberBlock
            label={remaining >= 0 ? "남음" : "초과"}
            value={formatWon(Math.abs(remaining))}
          />
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardMeta}>
            지출 {expenseCount}건 · 공휴일 {challenge.holidayDates.length}일
            제외
          </Text>
          <View style={styles.readOnlyBadge}>
            <MaterialCommunityIcons
              color={palette.muted}
              name="lock-outline"
              size={11}
            />
            <Text style={styles.readOnlyText}>읽기 전용</Text>
          </View>
        </View>
      </GlassSurface>
    </Pressable>
  );
});

function NumberBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.numberBlock}>
      <Text style={styles.numberLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.numberValue}>
        {value}
      </Text>
    </View>
  );
}

function formatMonth(value: string): string {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
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
  title: {
    flex: 1,
    color: palette.ink,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 3,
  },
  archiveIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: palette.green,
  },
  searchBox: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.md,
    backgroundColor: "rgba(255,255,255,0.52)",
  },
  searchInput: {
    flex: 1,
    color: palette.ink,
    fontSize: 14,
    paddingVertical: 0,
  },
  filters: {
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  filter: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  filterSelected: {
    backgroundColor: palette.green,
    borderColor: palette.green,
  },
  filterText: { color: palette.muted, fontSize: 11 },
  filterTextSelected: { color: palette.cream, fontWeight: "700" },
  monthGroup: { marginBottom: spacing.xxl },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  monthTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  monthCount: { color: palette.muted, fontSize: 11 },
  cards: { gap: spacing.md },
  card: { padding: spacing.lg, backgroundColor: "rgba(255,253,247,0.68)" },
  cardTop: { flexDirection: "row", alignItems: "center" },
  cardTitleGroup: { flex: 1 },
  resultBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radii.pill,
    backgroundColor: "rgba(57,123,88,0.10)",
  },
  resultBadgeOver: { backgroundColor: "rgba(182,83,72,0.10)" },
  resultText: { color: palette.success, fontSize: 9, fontWeight: "700" },
  resultTextOver: { color: palette.danger },
  cardTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 7,
  },
  cardPeriod: { color: palette.muted, fontSize: 10, marginTop: 3 },
  cardNumbers: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(47,113,93,0.08)",
  },
  numberBlock: { flex: 1, alignItems: "center", minWidth: 0 },
  numberLabel: { color: palette.muted, fontSize: 9 },
  numberValue: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    maxWidth: "92%",
  },
  verticalLine: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
  cardMeta: { color: palette.muted, fontSize: 10 },
  readOnlyBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  readOnlyText: { color: palette.muted, fontSize: 9 },
  empty: { alignItems: "center", paddingTop: 90 },
  emptyTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "700",
    marginTop: spacing.md,
  },
  emptyBody: { color: palette.muted, fontSize: 11, marginTop: 5 },
});
