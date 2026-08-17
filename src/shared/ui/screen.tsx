import type { PropsWithChildren, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette, spacing } from '@/shared/config/design';

type ScreenProps = PropsWithChildren<{
  scroll?: boolean;
  /**
   * Android 폼에서만 키보드가 화면을 덮지 않도록 스크롤 영역의 높이를 조정한다.
   * iOS는 ScrollView의 automaticallyAdjustKeyboardInsets로 처리한다.
   */
  keyboardAvoiding?: boolean;
  /**
   * 스크롤 영역과 분리해 화면 상단에 계속 노출할 콘텐츠다.
   * 모달 폼의 제목과 닫기 버튼처럼 스크롤되면 안 되는 요소에 사용한다.
   */
  fixedHeader?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}>;

type ScreenFrameProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function ScreenFrame({ children, style, testID }: ScreenFrameProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID={testID}>
      <View style={[styles.frame, style]}>{children}</View>
    </SafeAreaView>
  );
}

export function Screen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  fixedHeader,
  contentStyle,
  testID,
}: ScreenProps) {
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;
  const scrollView = (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.scrollContent}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
  const shouldAvoidKeyboard = keyboardAvoiding && Platform.OS === 'android';

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea} testID={testID}>
      {fixedHeader ? (
        <View style={styles.fixedHeader}>{fixedHeader}</View>
      ) : null}
      {scroll ? (
        shouldAvoidKeyboard ? (
          <KeyboardAvoidingView behavior="height" style={styles.keyboardAvoiding}>
            {scrollView}
          </KeyboardAvoidingView>
        ) : (
          scrollView
        )
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.cream,
  },
  keyboardAvoiding: { flex: 1 },
  fixedHeader: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: palette.cream,
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 520,
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingBottom: 120,
  },
  frame: {
    width: '100%',
    maxWidth: 520,
    flex: 1,
    alignSelf: 'center',
  },
});
