/** Builds a printable, paginated report document and sends it to the printer.
 *
 * Printing the page itself gave whatever the screen happened to look like. A report is
 * a document: a letterhead, who prepared it and when, a fixed number of records per
 * page, and a page number on every sheet — so a printed copy can be filed, and so two
 * copies of the same report look the same.
 *
 * Every printable page in the system prints through here, so a dentist's list and an
 * admin's report come off the printer as the same document. A page with more than one
 * thing to show (a patient's appointments and their dental records) passes `tables`;
 * a plain list passes `columns`/`rows`.
 */

/** Records on one sheet. Kept small enough that a page never overflows. */
export const ROWS_PER_PAGE = 20;

export interface ReportTable {
  /** Shown above the table when a document holds more than one. */
  heading?: string;
  columns: string[];
  rows: string[][];
  /** What to print in place of the rows when there are none. */
  emptyText?: string;
}

export interface ReportDoc {
  /** e.g. "Appointment Report" */
  title: string;
  /** A single table's columns/rows — the common case. */
  columns?: string[];
  rows?: string[][];
  /** Several sections instead, each with its own heading and columns. */
  tables?: ReportTable[];
  /** Shown under the title, e.g. Date Range / Dentist / Status — or, on a document
   * about one person, who it is about. */
  filters?: { label: string; value: string }[];
  preparedBy: { name: string; role: string };
  /** Manila date-time this report was generated. */
  generatedAt: string;
  rowsPerPage?: number;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

const DEFAULT_EMPTY = "No records found for these filters.";
/** A heading and its column row cost about two records' worth of the sheet. */
const HEADING_COST = 2;

/** Splits rows into sheets. An empty report still gets one sheet, so it prints as a
 * proper "no records" document rather than nothing at all. */
export function paginate<T>(rows: T[], size: number = ROWS_PER_PAGE): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages;
}

/** One table's slice on one sheet. A table too long for the sheet it starts on carries
 * on to the next, its heading repeated so a loose page still says what it is. */
export interface TableChunk {
  table: ReportTable;
  rows: string[][];
  /** Index of the first row, for numbering across sheets. */
  start: number;
  continued: boolean;
}

export function tablesOf(doc: ReportDoc): ReportTable[] {
  if (doc.tables?.length) return doc.tables;
  return [{ columns: doc.columns ?? [], rows: doc.rows ?? [], emptyText: DEFAULT_EMPTY }];
}

/** Lays the tables out over sheets, filling each one before starting the next. */
export function paginateTables(tables: ReportTable[], perPage: number = ROWS_PER_PAGE): TableChunk[][] {
  const sheets: TableChunk[][] = [];
  let sheet: TableChunk[] = [];
  let used = 0;

  const closeSheet = () => {
    if (sheet.length) sheets.push(sheet);
    sheet = [];
    used = 0;
  };

  for (const table of tables) {
    const cost = table.heading ? HEADING_COST : 0;
    let taken = 0;
    let continued = false;

    do {
      // Never start a section with no room left for a row of it.
      if (used + cost + 1 > perPage) closeSheet();

      const free = Math.max(1, perPage - used - cost);
      const rows = table.rows.slice(taken, taken + free);
      sheet.push({ table, rows, start: taken, continued });

      used += cost + Math.max(rows.length, 1);
      taken += rows.length;
      continued = true;

      if (used >= perPage) closeSheet();
    } while (taken < table.rows.length);
  }

  closeSheet();
  return sheets.length ? sheets : [[]];
}

const STYLES = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11px; }
  .sheet { display: flex; flex-direction: column; min-height: 269mm; break-after: page; }
  .sheet:last-of-type { break-after: auto; }
  .letterhead { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #0f766e; padding-bottom: 10px; }
  .letterhead img { width: 44px; height: 44px; object-fit: contain; }
  .clinic { font-size: 17px; font-weight: 700; margin: 0; letter-spacing: .2px; }
  .tagline { font-size: 10px; color: #6b7280; margin: 2px 0 0; }
  h2 { font-size: 14px; margin: 10px 0 6px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
  h3 { font-size: 11px; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: .6px; color: #0f766e; }
  h3:first-of-type { margin-top: 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin: 0 0 12px; font-size: 10px; }
  .meta div { display: flex; gap: 6px; }
  .meta dt { color: #6b7280; margin: 0; }
  .meta dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  table + h3 { margin-top: 14px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td.num, th.num { width: 32px; text-align: right; color: #6b7280; }
  .empty { text-align: center; color: #6b7280; padding: 24px; font-style: italic; }
  .sign { margin-top: 20px; }
  .sign .line { border-bottom: 1px solid #1f2937; width: 220px; height: 26px; }
  .sign .name { font-weight: 600; margin: 4px 0 0; }
  .sign .role { color: #6b7280; margin: 0; }
  .foot { margin-top: auto; padding-top: 10px; border-top: 1px solid #e5e7eb;
          display: flex; justify-content: space-between; font-size: 9px; color: #6b7280; }
`;

export function buildReportHtml(doc: ReportDoc, origin = ""): string {
  const perPage = doc.rowsPerPage ?? ROWS_PER_PAGE;
  const tables = tablesOf(doc);
  const sheets = paginateTables(tables, perPage);
  const total = tables.reduce((n, t) => n + t.rows.length, 0);
  const plain = tables.length === 1 && !tables[0].heading;

  const meta = [
    { label: "Date Generated", value: doc.generatedAt },
    { label: "Prepared By", value: `${doc.preparedBy.name} (${doc.preparedBy.role})` },
    ...(doc.filters ?? []),
    { label: "Total Records", value: String(total) },
  ];

  const header = `
    <div class="letterhead">
      <img src="${esc(origin)}/clinic-logo.png" alt="">
      <div>
        <p class="clinic">Ayag Dental Clinic</p>
        <p class="tagline">Dental Clinic Management System</p>
      </div>
    </div>
    <h2>${esc(doc.title)}</h2>
    <dl class="meta">
      ${meta.map((m) => `<div><dt>${esc(m.label)}:</dt><dd>${esc(m.value)}</dd></div>`).join("")}
    </dl>`;

  const chunkHtml = ({ table, rows, start, continued }: TableChunk) => {
    const body = rows.length
      ? rows.map((r, n) => `<tr><td class="num">${start + n + 1}</td>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${table.columns.length + 1}">${esc(table.emptyText ?? "No records.")}</td></tr>`;

    const heading = table.heading
      ? `<h3>${esc(table.heading)}${continued ? " (continued)" : ""}${
          rows.length && !continued ? ` — ${table.rows.length}` : ""}</h3>`
      : "";

    return `${heading}<table>
      <thead><tr><th class="num">#</th>${table.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  };

  const rendered = sheets.map((chunks, i) => {
    const signature = i === sheets.length - 1 ? `
      <div class="sign">
        <p>Prepared by:</p>
        <div class="line"></div>
        <p class="name">${esc(doc.preparedBy.name)}</p>
        <p class="role">${esc(doc.preparedBy.role)}</p>
      </div>` : "";

    // A plain list says which records this sheet holds; a document of several sections
    // counts the lot, since its sheets don't split on one running total.
    const first = chunks[0];
    const shown = plain
      ? (first?.rows.length ? `Records ${first.start + 1}–${first.start + first.rows.length} of ${total}` : "No records")
      : `Total records: ${total}`;

    return `<section class="sheet">
      ${header}
      ${chunks.length ? chunks.map(chunkHtml).join("") : ""}
      ${signature}
      <div class="foot"><span>${shown}</span><span>Page ${i + 1} of ${sheets.length}</span></div>
    </section>`;
  });

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
    <style>${STYLES}</style></head><body>${rendered.join("")}</body></html>`;
}

/** Prints via a hidden iframe rather than window.open(), so no popup blocker can stop it. */
export function printReport(doc: ReportDoc): boolean {
  const html = buildReportHtml(doc, window.location.origin);

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!frameDoc) {
    document.body.removeChild(iframe);
    return false;
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  // Give the letterhead image a moment to load, or the first sheet prints without it.
  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 1000);
  };
  const img = frameDoc.querySelector("img");
  if (img && !img.complete) {
    img.addEventListener("load", send, { once: true });
    img.addEventListener("error", send, { once: true });
    setTimeout(send, 1500); // never hang on a missing logo
  } else {
    send();
  }
  return true;
}
