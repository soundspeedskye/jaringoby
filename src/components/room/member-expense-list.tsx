import { memo } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { MemberList } from "@/components/room/member-list";
import { RoomHomeHeader } from "@/components/room/room-home-header";
import { spacing } from "@/shared/config/design";
import type { RoomHomeActions, RoomHomeData } from "@/hooks/use-room-home";

export const MemberExpenseList = memo(function MemberExpenseList({
  actions,
  data,
}: {
  actions: RoomHomeActions;
  data: RoomHomeData;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
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
    paddingBottom: 120,
  },
});
