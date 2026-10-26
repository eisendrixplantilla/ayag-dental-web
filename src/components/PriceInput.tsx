import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";

/** "1500.5" → "1,500.5": thousands get commas; the decimals are left as typed. */
function formatPrice(raw: string): string {
  if (!raw) return "";
  const [whole, decimals] = raw.split(".");
  const grouped = whole.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals === undefined ? grouped : `${grouped || "0"}.${decimals}`;
}

/** What was typed, as a plain number string ("1500.50"): digits and one point, two decimals at most. */
function toRaw(typed: string): string {
  const cleaned = typed.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned;
  return `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2)}`;
}

/**
 * A peso amount, shown with commas as it's typed (1,500 or 12,000.50). `value` and
 * `onValueChange` deal in the plain number string ("12000.50"), so saving is unchanged.
 * The caret stays after the same digit when a comma appears or goes.
 */
export default function PriceInput({ value, onValueChange, ...props }: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (raw: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Digits (and the point) before the caret, to put the caret back after re-formatting.
  const caret = useRef<number | null>(null);
  const shown = formatPrice(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caret.current === null || document.activeElement !== el) return;
    let seen = 0;
    let pos = 0;
    while (pos < shown.length && seen < caret.current) {
      if (/[\d.]/.test(shown[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [shown]);

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const before = e.target.value.slice(0, e.target.selectionStart ?? e.target.value.length);
        caret.current = before.replace(/[^\d.]/g, "").length;
        onValueChange(toRaw(e.target.value));
      }}
    />
  );
}
