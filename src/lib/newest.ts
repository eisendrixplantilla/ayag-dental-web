/**
 * A copy of `list`, newest first by a "YYYY-MM-DD" date or an ISO timestamp. Rows without
 * one go last, and rows on the same date keep their order, so the server's tie-break holds.
 */
export function newestFirst<T>(list: readonly T[], stamp: (item: T) => string | null | undefined): T[] {
  const at = (item: T) => {
    const t = Date.parse(stamp(item) ?? "");
    return Number.isNaN(t) ? -Infinity : t;
  };
  return list
    .map((item, i) => ({ item, i, t: at(item) }))
    .sort((a, b) => (b.t === a.t ? a.i - b.i : b.t > a.t ? 1 : -1))
    .map(({ item }) => item);
}
