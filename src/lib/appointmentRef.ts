/** A short, readable reference for an appointment — "APT-3F9C2A" — in place of the
 * 36-character id the database uses. It's taken from that id, so nothing new has to be
 * stored and the same appointment always reads the same on screen, on a printed report
 * and over the phone. */
export function appointmentRef(id: string): string {
  return `APT-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Whether a search box entry looks like this appointment: its short reference, with or
 * without the prefix, or the full id pasted in. */
export function matchesRef(id: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return appointmentRef(id).toLowerCase().includes(q) || id.toLowerCase().includes(q);
}
