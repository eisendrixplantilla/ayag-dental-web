import type { ClinicHourEntry } from "@/lib/api/settings";

const SHORT: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};

/** "13:30" or "13:30:00" -> "1:30 PM". */
export function clockLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The week's hours in one line, days with the same hours run together:
 * "Mon–Fri 9:00 AM–5:00 PM · Sat 9:00 AM–12:00 PM · Sun Closed". */
export function describeClinicHours(hours: ClinicHourEntry[]): string {
  const spans: { from: string; to: string; when: string }[] = [];
  for (const h of hours) {
    const day = SHORT[h.day] ?? h.day;
    const when = h.enabled && h.open && h.close ? `${clockLabel(h.open)}–${clockLabel(h.close)}` : "Closed";
    const last = spans.at(-1);
    if (last && last.when === when) last.to = day;
    else spans.push({ from: day, to: day, when });
  }
  return spans.map((s) => `${s.from === s.to ? s.from : `${s.from}–${s.to}`} ${s.when}`).join(" · ");
}
