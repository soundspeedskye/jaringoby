import { Image, type StyleProp, type ImageStyle } from "react-native";

import type { CommentReactionEmoji } from "@/shared/api/types";

const sources: Record<CommentReactionEmoji, number> = {
  "🥰": require("../../../assets/reactions/love.png"),
  "✌️": require("../../../assets/reactions/peace.png"),
  "👍": require("../../../assets/reactions/thumbs-up.png"),
  "🥲": require("../../../assets/reactions/tear.png"),
  "🫠": require("../../../assets/reactions/melt.png"),
  "🤔": require("../../../assets/reactions/thinking.png"),
  "👏": require("../../../assets/reactions/clap.png"),
  "👎": require("../../../assets/reactions/thumbs-down.png"),
  "🩷": require("../../../assets/reactions/heart.png"),
};

export function CommentReactionIcon({
  emoji,
  size,
  style,
}: {
  emoji: CommentReactionEmoji;
  size: number;
  style?: StyleProp<ImageStyle>;
}) {
  return <Image source={sources[emoji]} style={[{ height: size, width: size }, style]} />;
}
