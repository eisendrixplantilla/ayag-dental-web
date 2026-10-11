/** Sorting a table by one of its columns: click a heading to sort by it, click again to
 * reverse, a third time to go back to the table's own order.
 *
 * A column is sorted by what it holds, judged from the text the table shows (the same
 * text it filters and prints): dates and times in time order, amounts and counts as
 * numbers, everything else alphabetically. Empty cells ("—") always go last. */

export type SortDir = "asc" | "desc";
export interface TableSort { col: number; dir: SortDir }
export type ColumnKind = "date" | "time" | "number" | "text";

const EMPTY = /^\s*(—|-)?\s*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const WORD_DATE = /^[A-Z][a-z]{2,8}\.? \d{1,2}, \d{4}/;
// A time, or a span starting with one ("9:00 AM – 9:30 AM"), sorted by when it starts.
const TIME = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?(?:\s*[–-].*)?$/i;
const NUMBER = /^[₱\s]*-?[\d,]+(\.\d+)?\s*$/;

const isEmpty = (v: string | undefined) => v == null || EMPTY.test(v);

export function columnKind(values: (string | undefined)[]): ColumnKind {
  const filled = values.filter((v): v is string => !isEmpty(v));
  if (filled.length === 0) return "text";
  if (filled.every((v) => ISO_DATE.test(v) || WORD_DATE.test(v))) return "date";
  if (filled.every((v) => TIME.test(v.trim()))) return "time";
  if (filled.every((v) => NUMBER.test(v))) return "number";
  return "text";
}

/** Dates start newest first; everything else starts low to high, A to Z. */
export const firstDirection = (kind: ColumnKind): SortDir => (kind === "date" ? "desc" : "asc");

/** What one more click on a column's heading does. */
export function nextSort(current: TableSort | null, col: number, kind: ColumnKind): TableSort | null {
  const first = firstDirection(kind);
  if (!current || current.col !== col) return { col, dir: first };
  if (current.dir === first) return { col, dir: first === "asc" ? "desc" : "asc" };
  return null;
}

function keyOf(kind: ColumnKind, v: string): number | string {
  switch (kind) {
    case "date": {
      if (ISO_DATE.test(v)) return v;
      const t = Date.parse(v.replace(/\s+at\s+/, " "));
      return Number.isNaN(t) ? v : new Date(t).toISOString();
    }
    case "time": {
      const [, h, m, ap] = TIME.exec(v.trim())!;
      let hour = Number(h) % (ap ? 12 : 24);
      if (ap && ap.toUpperCase() === "PM") hour += 12;
      return hour * 60 + Number(m);
    }
    case "number":
      return Number(v.replace(/[₱,\s]/g, ""));
    default:
      return v.toLowerCase();
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The items in the order the sort asks for. Ties keep the table's own order. */
export function sortByColumn<T>(items: T[], rowOf: (item: T) => string[], sort: TableSort | null): T[] {
  if (!sort) return items;
  const kind = columnKind(items.map((i) => rowOf(i)[sort.col]));
  const sign = sort.dir === "asc" ? 1 : -1;
  const keyed = items.map((item, index) => {
    const v = rowOf(item)[sort.col];
    return { item, index, empty: isEmpty(v), key: isEmpty(v) ? "" : safeKey(kind, v!) };
  });
  keyed.sort((a, b) => {
    if (a.empty !== b.empty) return a.empty ? 1 : -1;
    const c = typeof a.key === "number" && typeof b.key === "number"
      ? a.key - b.key
      : collator.compare(String(a.key), String(b.key));
    return c * sign || a.index - b.index;
  });
  return keyed.map((k) => k.item);
}

function safeKey(kind: ColumnKind, v: string): number | string {
  try {
    return keyOf(kind, v);
  } catch {
    return v.toLowerCase();
  }
}

/** How a sorted column reads, e.g. on the heading's tooltip. */
export function describeSort(kind: ColumnKind, dir: SortDir): string {
  const asc = dir === "asc";
  switch (kind) {
    case "date": return asc ? "Oldest first" : "Newest first";
    case "time": return asc ? "Earliest first" : "Latest first";
    case "number": return asc ? "Lowest first" : "Highest first";
    default: return asc ? "A to Z" : "Z to A";
  }
}
