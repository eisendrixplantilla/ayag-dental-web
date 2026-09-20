// The clinic operates in one place (Philippines), so any date/time shown to a user
// should be anchored to Asia/Manila regardless of which region the serverless function
// itself executes in (Vercel's Node runtime defaults to UTC).
const MANILA_TZ = "Asia/Manila";

export function manilaDateStr(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return new Date(d).toLocaleDateString("en-CA", { timeZone: MANILA_TZ });
}

export function manilaTimeStr(d: Date): string {
  return d.toLocaleTimeString("en-US", { timeZone: MANILA_TZ, hour: "numeric", minute: "2-digit" });
}
