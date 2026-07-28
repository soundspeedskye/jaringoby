import { useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";

import { ReduceTransparencyStore } from "@/services/reduce-transparency-store";

const reduceTransparencyStore = new ReduceTransparencyStore({
  supported: Platform.OS === "ios",
  read: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  listen: (listener) => {
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      listener,
    );
    return () => subscription.remove();
  },
});

const getServerSnapshot = () => false;

export function useReduceTransparency(): boolean {
  return useSyncExternalStore(
    reduceTransparencyStore.subscribe,
    reduceTransparencyStore.getSnapshot,
    getServerSnapshot,
  );
}
