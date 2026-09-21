import { useEffect, useRef } from "react";

/**
 * Re-runs `refresh` on an interval while the tab is visible, and immediately when
 * the user comes back to it — so changes made by *other* people (a patient booking
 * online, another staff member adding a walk-in) show up without a manual reload.
 *
 * Polling pauses while the tab is hidden, so a forgotten background tab doesn't
 * keep hitting the API.
 */
export function useAutoRefresh(refresh: () => void, intervalMs = 15_000) {
  // Kept in a ref so callers can pass an inline function without restarting the timer.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    const interval = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs]);
}
