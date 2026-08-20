import { forwardRef, type ComponentRef } from "react";
import type { ScrollViewProps } from "react-native";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import type { SharedValue } from "react-native-reanimated";

type CommentChatScrollViewProps = ScrollViewProps & {
  extraContentPadding: SharedValue<number>;
  freeze?: boolean;
};

/**
 * 댓글 목록의 스크롤 컴포넌트. 키보드가 올라오면 목록도 함께 밀려 올라가
 * 채팅앱처럼 마지막 댓글이 가려지지 않는다. extraContentPadding으로 입력
 * 독의 높이만큼 아래 여백을 확보한다.
 *
 * freeze는 스크롤 보정만 잠시 끄는 스위치다. 여백(contentInset) 확장은 계속
 * 적용되므로, 얼려 둔 동안에도 목록 아래 공간은 그대로 확보된다.
 */
export const CommentChatScrollView = forwardRef<
  ComponentRef<typeof KeyboardChatScrollView>,
  CommentChatScrollViewProps
>(function CommentChatScrollView({ extraContentPadding, freeze, ...props }, ref) {
  return (
    <KeyboardChatScrollView
      {...props}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      extraContentPadding={extraContentPadding}
      freeze={freeze}
      keyboardLiftBehavior="always"
      ref={ref}
    />
  );
});
