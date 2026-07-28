import type { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { PageHeader } from "@/components/ui/page-header";
import { Screen } from "@/components/ui/screen";
import { palette } from "@/constants/design";

type HeaderSpacing = "md" | "lg" | "xl";

type ModalFormScreenProps = PropsWithChildren<{
  title: string;
  onBack: () => void;
  testID?: string;
  loading?: boolean;
  footer?: ReactNode;
  headerBottomSpacing?: HeaderSpacing;
}>;

export function ModalFormScreen({
  title,
  onBack,
  testID,
  loading = false,
  footer,
  headerBottomSpacing = "lg",
  children,
}: ModalFormScreenProps) {
  return (
    <Screen scroll={!loading} testID={testID}>
      <PageHeader
        bottomSpacing={headerBottomSpacing}
        modal
        onBack={onBack}
        title={title}
      />
      {loading ? (
        <View
          accessible
          accessibilityLabel="불러오는 중"
          accessibilityRole="progressbar"
          accessibilityState={{ busy: true }}
          style={styles.loading}
        >
          <ActivityIndicator
            accessibilityElementsHidden
            color={palette.green}
            importantForAccessibility="no"
            size="large"
          />
        </View>
      ) : (
        <>
          {children}
          {footer}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
});
