/** A short, readable reference for a patient — "PT-3F9C2A" — in place of the
 * 36-character id the database uses. Like the appointment reference, it's taken from
 * that id, so nothing new has to be stored and the same patient always reads the same
 * on screen and over the counter. */
export function patientRef(id: string): string {
  return `PT-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Age in whole years from a "YYYY-MM-DD" birthdate, or null if there isn't one.
 * The `patients` table also carries a plain `age` for rows entered at the front desk
 * without a birthdate, so callers fall back to that. */
export function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const hadBirthday = today.getMonth() + 1 > m || (today.getMonth() + 1 === m && today.getDate() >= d);
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/** "April 12, 1998" from "1998-04-12", built from the parts so the viewing device's
 * own timezone can't shift the date a day either way. */
export function formatBirthdate(birthdate: string): string {
  const [y, m, d] = birthdate.split("-").map(Number);
  if (!y || !m || !d) return birthdate;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
