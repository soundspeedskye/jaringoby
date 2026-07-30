import { memo, useCallback, useMemo, useState } from "react";
import {
  SectionList,
  StyleSheet,
  type SectionListRenderItemInfo,
} from "react-native";

import {
  MemberExpenseRow,
  MemberExpenseSectionFooter,
  MemberExpenseSectionHeader,
} from "@/components/expense/member-expense-section";
import { RoomHomeHeader } from "@/components/room/room-home-header";
import { spacing } from "@/constants/design";
import type { Expense } from "@/data/types";
import type { RoomHomeActions, RoomHomeData } from "@/hooks/use-room-home";

const EMPTY_EXPENSES: Expense[] = [];

type MemberExpenseSectionData = {
  key: string;
  member: RoomHomeData["memberRows"][number];
  expenses: Expense[];
  expanded: boolean;
  data: Expense[];
};

export const MemberExpenseList = memo(function MemberExpenseList({
  actions,
  data,
}: {
  actions: RoomHomeActions;
  data: RoomHomeData;
}) {
  const { commentCounts, expensesByUserId, memberRows } = data;
  const { onOpenExpense } = actions;
  const [expandedMemberIds, setExpandedMemberIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const toggleMemberExpenses = useCallback((memberId: string) => {
    setExpandedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }, []);
  const memberSections = useMemo<MemberExpenseSectionData[]>(
    () =>
      memberRows.map((member) => {
        const memberExpenses =
          expensesByUserId.get(member.id) ?? EMPTY_EXPENSES;
        const expanded = expandedMemberIds.has(member.id);
        return {
          key: member.id,
          member,
          expenses: memberExpenses,
          expanded,
          data: expanded ? memberExpenses : EMPTY_EXPENSES,
        };
      }),
    [expandedMemberIds, expensesByUserId, memberRows],
  );
  const renderMemberExpense = useCallback(
    ({
      item: expense,
      section,
    }: SectionListRenderItemInfo<Expense, MemberExpenseSectionData>) => (
      <MemberExpenseRow
        avatar={section.member.avatar}
        commentCount={commentCounts.get(expense.id) ?? 0}
        displayName={
          section.member.isCurrentUser ? "나" : section.member.nickname
        }
        expense={expense}
        isCrowned={section.member.isCrowned}
        onPress={onOpenExpense}
      />
    ),
    [commentCounts, onOpenExpense],
  );
  const renderMemberSectionFooter = useCallback(
    ({ section }: { section: MemberExpenseSectionData }) => (
      <MemberExpenseSectionFooter
        expanded={section.expanded}
        hasExpenses={section.expenses.length > 0}
        member={section.member}
      />
    ),
    [],
  );
  const renderMemberSectionHeader = useCallback(
    ({ section }: { section: MemberExpenseSectionData }) => (
      <MemberExpenseSectionHeader
        expanded={section.expanded}
        expenses={section.expenses}
        member={section.member}
        onToggle={toggleMemberExpenses}
      />
    ),
    [toggleMemberExpenses],
  );

  return (
    <SectionList
      contentContainerStyle={styles.content}
      keyExtractor={(expense) => expense.id}
      ListHeaderComponent={<RoomHomeHeader actions={actions} data={data} />}
      renderItem={renderMemberExpense}
      renderSectionFooter={renderMemberSectionFooter}
      renderSectionHeader={renderMemberSectionHeader}
      sections={memberSections}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
    />
  );
});

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
});
