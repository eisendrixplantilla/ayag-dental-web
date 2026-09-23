// One service was stored under a since-corrected spelling. Rows saved back then still
// hold the old one, so normalise on the way out: a single service shouldn't turn up
// twice in a filter, a report or a patient's record just because it was renamed.
const RENAMED: Record<string, string> = { Venners: "Veeners" };

export function displayService<T extends string | null | undefined>(name: T): T {
  return (name && RENAMED[name] ? RENAMED[name] : name) as T;
}

/** The old spellings that now display as `name`, so a lookup by the corrected name still
 * finds the row saved under the old one instead of creating a duplicate beside it. */
export function legacyNames(name: string): string[] {
  return Object.keys(RENAMED).filter((old) => RENAMED[old] === name);
}
