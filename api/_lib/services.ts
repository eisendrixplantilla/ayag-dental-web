// One service has been stored under two wrong spellings over the years. Rows saved
// back then still hold them, so normalise on the way out: a single service shouldn't
// turn up twice in a filter, a report or a patient's record just because it was
// renamed. Nothing is rewritten in place — the corrected name is what everyone reads.
const RENAMED: Record<string, string> = { Venners: "Veneers", Veeners: "Veneers" };

export function displayService<T extends string | null | undefined>(name: T): T {
  return (name && RENAMED[name] ? RENAMED[name] : name) as T;
}

/** The old spellings that now display as `name`, so a lookup by the corrected name still
 * finds the row saved under the old one instead of creating a duplicate beside it. */
export function legacyNames(name: string): string[] {
  return Object.keys(RENAMED).filter((old) => RENAMED[old] === name);
}
