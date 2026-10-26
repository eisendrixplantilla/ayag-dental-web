import { toLabel, toMinutes } from "@/lib/dentistSchedules";

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A dentist's week in a line or two: days with the same hours run together, e.g.
 * "Mon, Wed, Fri · 9:00 AM–5:00 PM", or "Mon–Fri · 9:00 AM–5:00 PM · Sat · 9:00 AM–12:00 PM". */
export function describeWorkingDays(days: { dayOfWeek: number; start: string; end: string }[]): string[] {
  const byHours = new Map<string, number[]>();
  for (const d of [...days].sort((a, b) => a.dayOfWeek - b.dayOfWeek)) {
    const hours = `${toLabel(toMinutes(d.start))}–${toLabel(toMinutes(d.end))}`;
    byHours.set(hours, [...(byHours.get(hours) ?? []), d.dayOfWeek]);
  }
  return [...byHours].map(([hours, list]) => `${dayList(list)} · ${hours}`);
}

/** When a service is done, e.g. "Mon, Wed · 9:00 AM–12:00 PM", or with how many a day,
 * "Mon (max 3), Wed (max 2), Fri"; null when it's whenever the dentist works. */
export function describeServiceHours(
  h: { days: number[]; start: string | null; end: string | null; dayLimits?: Record<string, number> } | undefined,
): string | null {
  if (!h || (!h.days.length && !h.start)) return null;
  const sorted = [...h.days].sort((a, b) => a - b);
  const limits = h.dayLimits ?? {};
  const days = Object.keys(limits).length
    ? sorted.map((d) => (limits[String(d)] ? `${SHORT[d]} (max ${limits[String(d)]})` : SHORT[d])).join(", ")
    : dayList(sorted);
  return [
    h.days.length ? days : "Any working day",
    h.start && h.end ? `${toLabel(toMinutes(h.start))}–${toLabel(toMinutes(h.end))}` : null,
  ].filter(Boolean).join(" · ");
}

/** "Mon–Fri" for a run of three or more days in a row, otherwise "Mon, Wed, Fri". */
function dayList(list: number[]): string {
  const runs: number[][] = [];
  for (const d of list) {
    const last = runs.at(-1);
    if (last && d === last[last.length - 1] + 1) last.push(d);
    else runs.push([d]);
  }
  return runs
    .map((r) => (r.length >= 3 ? `${SHORT[r[0]]}–${SHORT[r[r.length - 1]]}` : r.map((d) => SHORT[d]).join(", ")))
    .join(", ");
}

/** "Dr. Mike Johnson" → "MJ", for a dentist without a photo. */
export const initialsOf = (name: string) =>
  name.replace(/^Dr\.?\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
