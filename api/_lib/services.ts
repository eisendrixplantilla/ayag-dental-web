// Some services are stored under names the clinic no longer uses: two misspellings of
// Veneers, and "Oral", now called Oral Prophylaxis. Rows saved back then still hold them,
// so normalise on the way out: a single service shouldn't turn up twice in a filter, a
// report or a patient's record just because it was renamed. Nothing is rewritten in
// place — the current name is what everyone reads.
const RENAMED: Record<string, string> = { Venners: "Veneers", Veeners: "Veneers", Oral: "Oral Prophylaxis" };

/** A visit's services share one field, joined like this. */
const LIST = ", ";

/** The current name of a service, or of each service in a visit's "A, B" list. */
export function displayService<T extends string | null | undefined>(name: T): T {
  if (!name) return name;
  return name.split(LIST).map((s) => RENAMED[s] ?? s).join(LIST) as T;
}

/** The old names that now display as `name` (in any case), so a lookup by the current name
 * still finds the row saved under the old one instead of creating a duplicate beside it. */
export function legacyNames(name: string): string[] {
  return Object.keys(RENAMED).filter((old) => RENAMED[old].toLowerCase() === name.toLowerCase());
}
