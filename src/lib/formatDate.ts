// The clinic operates in one place (Philippines), so printed/generated timestamps should
// reflect Asia/Manila regardless of the viewing device's own timezone setting.
const MANILA_TZ = "Asia/Manila";

export function formatManilaDate(d: Date | string = new Date()): string {
  return new Date(d).toLocaleDateString("en-US", { timeZone: MANILA_TZ });
}

export function formatManilaDateTime(d: Date | string = new Date()): string {
  return new Date(d).toLocaleString("en-US", { timeZone: MANILA_TZ });
}
