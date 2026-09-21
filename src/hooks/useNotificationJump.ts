import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const FLASH_MS = 3000;

/**
 * Consumes the `highlightId` the notifications bell passes through router state:
 * scrolls the matching row into view and flashes it so the item that was clicked
 * is obvious on arrival.
 *
 * `resolveRowKey` maps the id the bell sent (always an appointment id) onto the key
 * this page actually renders rows by — Dental Records, for instance, keys rows by
 * record id, so it looks the record up by its appointmentId.
 */
export function useNotificationJump(
  resolveRowKey: (highlightId: string) => string | undefined,
  onArrive?: () => void,
) {
  const location = useLocation();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());

  // Kept in a ref so callers don't have to memoise it to avoid re-firing the effect.
  const onArriveRef = useRef(onArrive);
  onArriveRef.current = onArrive;

  const registerRow = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(key, el);
      else rows.current.delete(key);
    },
    [],
  );

  // Take the id, then immediately clear it from history so a refresh or a
  // back-navigation doesn't jump all over again.
  useEffect(() => {
    const state = location.state as { highlightId?: string } | null;
    if (!state?.highlightId) return;
    setPendingId(state.highlightId);
    // Lets the page clear any filter that would keep the target row off screen.
    onArriveRef.current?.();
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state]);

  // No dependency array on purpose: the list loads asynchronously, so we retry on
  // each render until the row we're after has actually been mounted.
  useEffect(() => {
    if (!pendingId) return;
    const key = resolveRowKey(pendingId);
    if (!key) return;
    const el = rows.current.get(key);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setPendingId(null);
    setHighlightedKey(key);
  });

  useEffect(() => {
    if (!highlightedKey) return;
    const timer = setTimeout(() => setHighlightedKey(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [highlightedKey]);

  // `pendingId` is exposed so a page can get the target on screen before it can be
  // scrolled to — switching to the tab that holds it, for instance.
  return { highlightedKey, registerRow, pendingId };
}

/** Shared flash styling so every jump target looks the same. */
export const HIGHLIGHT_ROW_CLASS = "bg-primary/10 ring-2 ring-inset ring-primary/50";
