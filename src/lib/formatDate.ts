// The clinic operates in one place (Philippines), so printed/generated timestamps should
// reflect Asia/Manila regardless of the viewing device's own timezone setting.
const MANILA_TZ = "Asia/Manila";

export function formatManilaDate(d: Date | string = new Date()): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: MANILA_TZ });
}

export function formatManilaDateTime(d: Date | string = new Date()): string {
  return new Date(d).toLocaleString("en-US", { timeZone: MANILA_TZ });
}

export function formatManilaTime(d: Date | string = new Date()): string {
  return new Date(d).toLocaleTimeString("en-US", { timeZone: MANILA_TZ });
}

/** Today's date in Manila as "YYYY-MM-DD" — for <input type="date"> min/max, date-string
 * comparisons, and any "today" constant that must ignore the viewing device's own timezone. */
export function manilaTodayDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: MANILA_TZ });
}

/** Today's date in Manila, expressed as a Date at LOCAL midnight (same convention date-pickers
 * like react-day-picker use), so it compares correctly against their own local Date objects. */
export function manilaTodayAsLocalDate(): Date {
  const [y, m, d] = manilaTodayDateStr().split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Current Manila time-of-day, in minutes since midnight — for "is this time slot still
 * upcoming today" checks that must ignore the viewing device's own clock/timezone. */
export function manilaNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}
