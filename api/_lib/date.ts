// The clinic operates in one place (Philippines), so any date/time shown to a user
// should be anchored to Asia/Manila regardless of which region the serverless function
// itself executes in (Vercel's Node runtime defaults to UTC).
const MANILA_TZ = "Asia/Manila";

export function manilaDateStr(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return new Date(d).toLocaleDateString("en-CA", { timeZone: MANILA_TZ });
}

/** Current Manila time of day, in minutes since midnight. */
export function manilaNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return hour * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}

export function manilaTimeStr(d: Date): string {
  return d.toLocaleTimeString("en-US", { timeZone: MANILA_TZ, hour: "numeric", minute: "2-digit" });
}
