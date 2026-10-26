/** An appointment's reference as the clinic reads it: APT-261000001 (APT, the year and
 * month it was booked, its number that month). The server gives it; a booking made a
 * moment ago may not have it yet, and shows a dash until it does. */
export function appointmentRef(a: { reference?: string | null }): string {
  return a.reference ?? "—";
}

/** Whether a search box entry is (part of) this appointment's reference, with or without
 * the prefix. */
export function matchesRef(a: { reference?: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return !!a.reference && a.reference.toLowerCase().includes(q);
}
