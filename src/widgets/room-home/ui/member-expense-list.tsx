import { memo } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { MemberList } from "@/entities/member/ui/member-list";
import { RoomHomeHeader } from "./room-home-header";
import { spacing } from "@/shared/config/design";
import { usePullToRefreshControl } from "@/shared/ui/pull-to-refresh";
import { useTabBarClearance } from "@/shared/lib/use-tab-bar-clearance";
import type { RoomHomeActions, RoomHomeData } from "../model/types";

export const MemberExpenseList = memo(function MemberExpenseList({
  actions,
  data,
}: {
  actions: RoomHomeActions;
  data: RoomHomeData;
}) {
  const tabBarClearance = useTabBarClearance();
  const refreshControl = usePullToRefreshControl();

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: tabBarClearance }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}
    >
      <RoomHomeHeader actions={actions} data={data} />
      <MemberList
        members={data.memberRows}
        onPressAvatar={actions.onOpenMemberFeed}
      />
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
  },
});
