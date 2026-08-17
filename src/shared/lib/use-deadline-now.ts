import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";

const MAX_TIMEOUT_MS = 2_147_483_647;
const BOUNDARY_MARGIN_MS = 50;

/**
 * Refreshes display-only time at meaningful boundaries while the route is visible.
 * Server/RPC time remains authoritative for permissions.
 */
export function useDeadlineNow(
  deadlines: readonly (number | null | undefined)[],
  enabled = true,
): number {
  const isFocused = useIsFocused();
  const [now, setNow] = useState(() => Date.now());
  const deadlineKey = deadlines
    .filter((deadline): deadline is number => Number.isFinite(deadline))
    .map((deadline) => Math.trunc(deadline))
    .sort((left, right) => left - right)
    .join("|");
  const normalizedDeadlines = useMemo(
    () => (deadlineKey ? deadlineKey.split("|").map(Number) : []),
    [deadlineKey],
  );

  useEffect(() => {
    if (!enabled || !isFocused) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const clearTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      clearTimer();
      const current = Date.now();
      setNow(current);
      const nextDeadline = normalizedDeadlines.find(
        (deadline) => deadline > current,
      );
      if (nextDeadline === undefined) return;
      const delay = Math.min(
        MAX_TIMEOUT_MS,
        Math.max(0, nextDeadline - current + BOUNDARY_MARGIN_MS),
      );
      timer = setTimeout(schedule, delay);
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") schedule();
      else clearTimer();
    });

    if (AppState.currentState === null || AppState.currentState === "active") {
      schedule();
    }
    return () => {
      clearTimer();
      subscription.remove();
    };
  }, [enabled, isFocused, normalizedDeadlines]);

  return now;
}
