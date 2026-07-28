import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import {
  memo,
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type SectionListRenderItemInfo,
} from "react-native";

import { ChoiceChip } from "@/components/ui/choice-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { GlassSurface } from "@/components/ui/glass-surface";
import { PageHeader } from "@/components/ui/page-header";
import { ScreenFrame } from "@/components/ui/screen";
import { palette, radii, spacing } from "@/constants/design";
import type { Period, PeriodResult, Room } from "@/data/types";
import {
  useActiveRoom,
  useCurrentUser,
  useHistory,
  useResultsForPeriods,
  useRooms,
  useRoomStats,
} from "@/providers/app-data-hooks";
import { formatWon } from "@/utils/format";

type ResultFilter = "전체" | "달성" | "초과";
type HistoryRecord = {
  period: Period;
  room: Room | undefined;
  result: PeriodResult;
};
type HistorySection = {
  key: string;
  month: string;
  data: HistoryRecord[];
};

export default function HistoryScreen() {
  const router = useRouter();
  const activeRoom = useActiveRoom();
  const currentUser = useCurrentUser();
  const { pastPeriods } = useHistory();
  const periodIds = useMemo(
    () => pastPeriods.map((period) => period.id),
    [pastPeriods],
  );
  const roomIds = useMemo(
    () => pastPeriods.map((period) => period.roomId),
    [pastPeriods],
  );
  const resultsByPeriodId = useResultsForPeriods(periodIds);
  const roomsById = useRooms(roomIds);
  const roomStats = useRoomStats(activeRoom?.id);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("전체");
  const deferredQuery = useDeferredValue(query);

  // D4: 누적 통계는 서버 뷰(room_member_stats)의 내 행을 그대로 보여준다.
  const myStats = useMemo(() => {
    if (!activeRoom || !currentUser) return null;
    return (
      roomStats.find(
        (stats) => stats.userId === currentUser.id,
      ) ??
      null
    );
  }, [activeRoom, currentUser, roomStats]);

  const baseRecords = useMemo(
    () =>
      pastPeriods
        .map((period) => {
          const result = (resultsByPeriodId.get(period.id) ?? []).find(
            (item) => item.userId === currentUser?.id,
          );
          if (!result) return null;
          return {
            period,
            room: roomsById.get(period.roomId),
            result,
          };
        })
        .filter((record): record is NonNullable<typeof record> =>
          Boolean(record),
        ),
    [currentUser, pastPeriods, resultsByPeriodId, roomsById],
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("ko-KR");
    return baseRecords
      .filter((record) =>
        (record.room?.name ?? "")
          .toLocaleLowerCase("ko-KR")
          .includes(normalizedQuery),
      )
      .filter(
        (record) =>
          filter === "전체" ||
          (filter === "달성" ? record.result.achieved : !record.result.achieved),
      );
  }, [baseRecords, deferredQuery, filter]);

  const sections = useMemo<HistorySection[]>(() => {
    const groups = new Map<string, typeof filteredRecords>();
    filteredRecords.forEach((record) => {
      const month = record.period.weekEnd.slice(0, 7);
      const monthRecords = groups.get(month);
      if (monthRecords) monthRecords.push(record);
      else groups.set(month, [record]);
    });
    return [...groups.entries()].map(([month, records]) => ({
      key: month,
      month,
      data: records,
    }));
  }, [filteredRecords]);
  const openPeriod = useCallback(
    (periodId: string) => router.push(`/history/${periodId}`),
    [router],
  );
  const renderRecord = useCallback(
    ({
      item: record,
    }: SectionListRenderItemInfo<HistoryRecord, HistorySection>) => (
      <HistoryCard
        onSelect={openPeriod}
        period={record.period}
        result={record.result}
        room={record.room}
      />
    ),
    [openPeriod],
  );

  return (
    <ScreenFrame testID="period-history-screen">
      <SectionList
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={HistoryCardSeparator}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(record) => record.period.id}
        ListEmptyComponent={
          <EmptyState
            description="매주 정산이 끝나면 이곳에 월별로 자동 보관돼요."
            icon="archive-search-outline"
            title={
              query || filter !== "전체"
                ? "조건에 맞는 기록이 없어요."
                : "아직 정산이 끝난 주차가 없어요."
            }
          />
        }
        ListHeaderComponent={
          <>
            <PageHeader
              bottomSpacing="md"
              onBack={() => router.back()}
              right={
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={styles.archiveIcon}
                >
                  <MaterialCommunityIcons
                    color={palette.yellow}
                    name="archive-check-outline"
                    size={23}
                  />
                </View>
              }
              title="지난 주차"
            />

            {myStats ? (
              <GlassSurface
                style={styles.statsCard}
                testID="cumulative-stats-card"
              >
                <Text style={styles.statsTitle}>
                  {activeRoom?.name ?? "내 방"} 누적 기록
                </Text>
                <View style={styles.statsRow}>
                  <StatBlock
                    label="참여 주차"
                    value={`${myStats.participatedWeekCount}주`}
                  />
                  <View style={styles.statsLine} />
                  <StatBlock
                    label="달성 주차"
                    value={`${myStats.achievedWeekCount}주`}
                  />
                  <View style={styles.statsLine} />
                  <StatBlock
                    highlight
                    label="연속 달성"
                    value={`${myStats.currentStreak}주`}
                  />
                  <View style={styles.statsLine} />
                  <StatBlock label="왕관" value={`👑 ${myStats.crownCount}`} />
                </View>
              </GlassSurface>
            ) : null}

            <View style={styles.searchBox}>
              <MaterialCommunityIcons
                color={palette.greenSoft}
                name="magnify"
                size={20}
              />
              <TextInput
                accessibilityLabel="방 이름 검색"
                onChangeText={setQuery}
                placeholder="방 이름 검색"
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

            <View
              accessibilityLabel="주차 결과 필터"
              accessibilityRole="radiogroup"
              style={styles.filters}
            >
              {(["전체", "달성", "초과"] as ResultFilter[]).map((item) => (
                <ChoiceChip
                  key={item}
                  label={item}
                  onPress={() => setFilter(item)}
                  selected={filter === item}
                />
              ))}
            </View>
          </>
        }
        renderItem={renderRecord}
        renderSectionFooter={HistorySectionFooter}
        renderSectionHeader={({ section }) => (
          <View style={styles.monthHeader}>
            <Text style={styles.monthTitle}>{formatMonth(section.month)}</Text>
            <Text style={styles.monthCount}>{section.data.length}개</Text>
          </View>
        )}
        sections={sections}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
      />
    </ScreenFrame>
  );
}

function HistoryCardSeparator() {
  return <View style={styles.cardSeparator} />;
}

function HistorySectionFooter() {
  return <View style={styles.monthFooter} />;
}

const HistoryCard = memo(function HistoryCard({
  period,
  room,
  result,
  onSelect,
}: {
  period: Period;
  room: Room | undefined;
  result: PeriodResult;
  onSelect: (periodId: string) => void;
}) {
  const achieved = result.achieved;
  return (
    <Pressable accessibilityRole="button" onPress={() => onSelect(period.id)}>
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
                {result.isCrown ? " · 👑" : ""}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {room?.name ?? "방"} · {period.weekIndex}주차
            </Text>
            <Text style={styles.cardPeriod}>
              {period.weekStart} ~ {period.weekEnd}
            </Text>
          </View>
          <MaterialCommunityIcons
            color={palette.greenSoft}
            name="chevron-right"
            size={22}
          />
        </View>
        <View style={styles.cardNumbers}>
          <NumberBlock label="내 적용한도" value={formatWon(result.appliedLimit)} />
          <View style={styles.verticalLine} />
          <NumberBlock label="사용" value={formatWon(result.spentAmount)} />
          <View style={styles.verticalLine} />
          <NumberBlock
            label={result.remainingAmount >= 0 ? "남음" : "초과"}
            value={formatWon(Math.abs(result.remainingAmount))}
          />
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardMeta}>
            유효 평일 {period.validDayCount}일 · 공휴일{" "}
            {period.holidayDates.length}일 제외
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

function StatBlock({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.statValue, highlight && styles.statValueHighlight]}
      >
        {value}
      </Text>
    </View>
  );
}

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
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  archiveIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: palette.green,
  },
  statsCard: {
    padding: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: "rgba(255,253,247,0.68)",
  },
  statsTitle: { color: palette.ink, fontSize: 13, fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(47,113,93,0.08)",
  },
  statBlock: { flex: 1, alignItems: "center", minWidth: 0 },
  statLabel: { color: palette.muted, fontSize: 9 },
  statValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
    maxWidth: "92%",
  },
  statValueHighlight: { color: palette.green },
  statsLine: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: palette.line,
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
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  monthTitle: { color: palette.ink, fontSize: 18, fontWeight: "800" },
  monthCount: { color: palette.muted, fontSize: 11 },
  cardSeparator: { height: spacing.md },
  monthFooter: { height: spacing.xxl },
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
});
