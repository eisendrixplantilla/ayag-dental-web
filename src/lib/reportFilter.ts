/** Narrowing a report that has already been generated: by one column or across all of
 * them, by a value picked from a list, by typed text, or — for a column of dates — by a
 * range. The rows left are what's shown and what prints. */

export const ALL_FIELDS = "all";

export interface ReportFilter {
  /** ALL_FIELDS, or the index of the column being filtered. */
  field: string;
  /** Typed text, or a value picked from the column's own entries. */
  value: string;
  /** Date-column range; either end may be left open. */
  from: string;
  to: string;
}

export const EMPTY_FILTER: ReportFilter = { field: ALL_FIELDS, value: "", from: "", to: "" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Whether a column holds dates, so it should be filtered by range rather than by text.
 * Decided from the data, so it works for whatever columns a report happens to have. */
export function isDateColumn(rows: string[][], col: number): boolean {
  const values = rows.map((r) => r[col]).filter(Boolean);
  return values.length > 0 && values.every((v) => DATE.test(v));
}

export function filterIsActive(f: ReportFilter): boolean {
  return Boolean(f.value.trim() || f.from || f.to);
}

/** Whether one row survives the filter. A list page filters its own items with this,
 * passing the same text row it would print. */
export function matchesReportFilter(row: string[], f: ReportFilter): boolean {
  const col = f.field === ALL_FIELDS ? -1 : Number(f.field);

  if (col >= 0 && (f.from || f.to)) {
    const v = row[col] ?? "";
    if (!DATE.test(v)) return false;
    return (!f.from || v >= f.from) && (!f.to || v <= f.to);
  }

  const q = f.value.trim().toLowerCase();
  if (!q) return true;
  return (col < 0 ? row.join(" ") : row[col] ?? "").toLowerCase().includes(q);
}

export function filterReportRows(rows: string[][], f: ReportFilter): string[][] {
  return rows.filter((r) => matchesReportFilter(r, f));
}

/** How the filter reads on the printed document, or null when nothing is filtered. */
export function describeReportFilter(columns: string[], f: ReportFilter): string | null {
  const name = f.field === ALL_FIELDS ? null : columns[Number(f.field)];

  if (name && (f.from || f.to)) {
    const span = f.from && f.to ? `${f.from} to ${f.to}` : f.from ? `from ${f.from}` : `up to ${f.to}`;
    return `${name}: ${span}`;
  }

  const q = f.value.trim();
  if (!q) return null;
  return name ? `${name}: ${q}` : q;
}
