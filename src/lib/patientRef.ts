/** The Patient ID as the clinic reads it: PT-26100001 (PT, the year and month the
 * account was made, its number that month). The server gives it; a dash until it has. */
export function patientRef(p: { code?: string | null }): string {
  return p.code ?? "—";
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
