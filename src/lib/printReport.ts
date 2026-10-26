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
import { columnKind } from "@/lib/tableClass";

/** Records on one sheet when the real rows can't be measured (no layout to measure in,
 * e.g. under test). Sized for the worst case: the last sheet, with the signature block
 * and the letterhead's contact lines, and every row wrapping to two lines. When printing
 * for real, `printReport` measures the rows instead and fills each sheet to its foot. */
export const ROWS_PER_PAGE = 15;

/** How much of a sheet the content may fill, in CSS px. A sheet is 255mm (see `.sheet`);
 * the few mm held back absorb rounding between the screen layout the rows are measured
 * in and the printer's, so a full sheet never spills its footer onto a page of its own. */
export const SHEET_BUDGET_PX = (250 * 96) / 25.4;

/** Heights measured from a rendering of the document, in CSS px. */
export interface SheetMetrics {
  /** Letterhead, title and filters: everything above the first table. */
  header: number;
  /** The page footer ("Records 1–30 of 42 · Page 1 of 2"). */
  foot: number;
  /** "Prepared by" and the signature line, on the last sheet. */
  signature: number;
  /** Per table (in `tablesOf` order): its heading, its column row, and each record's row.
   * A table with no records has one entry in `rows`: its "no records" line. */
  tables: { heading: number; thead: number; rows: number[] }[];
}

export interface ReportTable {
  /** Shown above the table when a document holds more than one. */
  heading?: string;
  columns: string[];
  rows: string[][];
  /** What to print in place of the rows when there are none. */
  emptyText?: string;
}

/** The clinic's details under its name on every sheet. Missing parts are left off. */
export interface ClinicLetterhead {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Already worded, e.g. "Mon–Fri 9:00 AM–5:00 PM · Sat 9:00 AM–12:00 PM · Sun Closed". */
  hours?: string | null;
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
  clinic?: ClinicLetterhead | null;
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

/** Columns no printed document carries. Pages still show them on screen (and can be
 * filtered by them); on paper the reference code and the booking channel only crowd
 * the table. */
export const NOT_PRINTED = new Set(["Reference", "Type"]);

function withoutUnprinted(table: ReportTable): ReportTable {
  const keep = table.columns.flatMap((c, i) => (NOT_PRINTED.has(c) ? [] : [i]));
  if (keep.length === table.columns.length) return table;
  return { ...table, columns: keep.map((i) => table.columns[i]), rows: table.rows.map((r) => keep.map((i) => r[i])) };
}

export function tablesOf(doc: ReportDoc): ReportTable[] {
  const tables = doc.tables?.length
    ? doc.tables
    : [{ columns: doc.columns ?? [], rows: doc.rows ?? [], emptyText: DEFAULT_EMPTY }];
  return tables.map(withoutUnprinted);
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

/** Lays the tables out over sheets by measured height: each sheet takes as many rows as
 * fit above its footer, so a sheet of one-line rows holds more than one of long, wrapped
 * names, and neither leaves half the sheet empty. The last sheet must also hold the
 * signature; if it can't, its last rows move to a sheet of their own with it, so the
 * signature never stands alone. */
export function fitSheets(tables: ReportTable[], m: SheetMetrics, budget: number = SHEET_BUDGET_PX): TableChunk[][] {
  const fresh = () => ({ chunks: [] as TableChunk[], used: m.header + m.foot });
  const sheets: { chunks: TableChunk[]; used: number }[] = [];
  let sheet = fresh();
  const close = () => {
    sheets.push(sheet);
    sheet = fresh();
  };
  const metricsOf = (table: ReportTable) => m.tables[tables.indexOf(table)] ?? { heading: 0, thead: 0, rows: [] };
  const topOf = (table: ReportTable) => (table.heading ? metricsOf(table).heading : 0) + metricsOf(table).thead;

  for (const table of tables) {
    const tm = metricsOf(table);
    const rowH = (i: number) => tm.rows[i] ?? tm.rows[tm.rows.length - 1] ?? 0;
    const top = topOf(table);
    const count = table.rows.length;
    let taken = 0;
    let continued = false;

    do {
      // Never start a table where not even its first row fits under its heading.
      if (sheet.chunks.length && sheet.used + top + rowH(taken) > budget) close();

      let add = top + (count === 0 ? rowH(0) : 0);
      let n = 0;
      // At least one row per chunk, even one taller than a sheet, or this never ends.
      while (taken + n < count && (n === 0 || sheet.used + add + rowH(taken + n) <= budget)) {
        add += rowH(taken + n);
        n++;
      }
      sheet.chunks.push({ table, rows: table.rows.slice(taken, taken + n), start: taken, continued });
      sheet.used += add;
      taken += n;
      continued = true;
      if (taken < count) close();
    } while (taken < count);
  }
  close();

  // Room for the signature on the last sheet, or carry its last rows over to a new one
  // with it (a row or two, never the sheet's only content).
  const last = sheets[sheets.length - 1];
  if (last.used + m.signature > budget) {
    const chunk = last.chunks[last.chunks.length - 1];
    const carry = !chunk ? 0 : chunk.rows.length > 1 ? Math.min(2, chunk.rows.length - 1) : last.chunks.length > 1 ? chunk.rows.length : 0;
    const next = fresh();
    if (chunk && carry > 0) {
      const keep = chunk.rows.length - carry;
      if (keep > 0) last.chunks[last.chunks.length - 1] = { ...chunk, rows: chunk.rows.slice(0, keep) };
      else last.chunks.pop();
      next.chunks.push({ table: chunk.table, rows: chunk.rows.slice(keep), start: chunk.start + keep, continued: keep > 0 || chunk.continued });
    }
    sheets.push(next);
  }

  return sheets.map((x) => x.chunks);
}

const STYLES = `
  @page { size: A4 portrait; margin: 14mm; }
  * { box-sizing: border-box; }
  /* Sized in pt, not px: a printer works in points, and the px sizes this used to carry
     came out around 7.5pt — far below the 10-11pt a document is normally set in. */
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11pt; }
  /* A4 leaves 269mm inside the margins, but browsers don't all measure it alike: Firefox
     finds a little less, and a sheet that fills all 269mm spills its footer onto a page
     of its own, leaving every other page blank. The slack keeps one sheet to one page. */
  .sheet { display: flex; flex-direction: column; min-height: 255mm; break-after: page; }
  .sheet:last-of-type { break-after: auto; }
  .letterhead { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #0f766e; padding-bottom: 8px; }
  .letterhead img { width: 46px; height: 46px; object-fit: contain; }
  .clinic { font-size: 18pt; font-weight: 700; margin: 0; letter-spacing: .2px; }
  .contact { margin: 2px 0 0; font-size: 9pt; color: #4b5563; line-height: 1.35; }
  h2 { font-size: 15pt; margin: 9px 0 5px; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
  h3 { font-size: 11pt; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: .6px; color: #0f766e; }
  h3:first-of-type { margin-top: 0; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin: 0 0 10px; font-size: 10pt; }
  .meta div { display: flex; gap: 6px; }
  .meta dt { color: #6b7280; margin: 0; }
  .meta dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  table + h3 { margin-top: 12px; }
  th, td { border: 1px solid #d1d5db; padding: 4px 7px; text-align: left; vertical-align: top; }
  /* Headings in normal case: capitals at 10pt made words like "Appointments" too wide to
     fit a six-column table across A4. */
  th { background: #f3f4f6; font-size: 10pt; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td.num, th.num { width: 34px; text-align: right; color: #6b7280; }
  /* Short values (dates, numbers, statuses) stay on one line, and long unbroken ones
     (emails) may break, so the width goes to the columns that need it: names. */
  td.nowrap { white-space: nowrap; }
  td.name, th.name { min-width: 30mm; }
  td.breakable, th.breakable { min-width: 36mm; overflow-wrap: anywhere; }
  /* The clinic's alignment rules: numbers right, codes, dates and statuses centered. */
  td.al-r, th.al-r { text-align: right; }
  td.al-c, th.al-c { text-align: center; }
  .empty { text-align: center; color: #6b7280; padding: 20px; font-style: italic; }
  .sign { margin-top: 18px; }
  .sign .line { border-bottom: 1px solid #1f2937; width: 220px; height: 24px; }
  .sign .name { font-weight: 600; margin: 4px 0 0; }
  .sign .role { color: #6b7280; margin: 0; font-size: 10pt; }
  .foot { margin-top: auto; padding-top: 8px; border-top: 1px solid #e5e7eb;
          display: flex; justify-content: space-between; font-size: 9pt; color: #6b7280; }
  /* While rows are being measured: each sheet only as tall as what's on it, and no
     scrollbar taking width the printed page has, or rows wrap that won't on paper. */
  html.measuring { overflow: hidden; }
  html.measuring .sheet { min-height: 0; }
`;

/** How a column sits in the table, judged by its heading. */
export function columnFit(column: string): "nowrap" | "name" | "breakable" | "" {
  if (/email/i.test(column)) return "breakable";
  if (/name|^patient$|^dentist$|prescribed by|archived by/i.test(column)) return "name";
  if (/date|^time$|contact|phone|^status$|registered|booked on|^age$|amount|price|^count$|^id$|employee id/i.test(column)) return "nowrap";
  return "";
}

/** The letterhead's small print: where the clinic is, how to reach it, when it's open. */
export function contactLines(c: ClinicLetterhead | null | undefined): string[] {
  if (!c) return [];
  const reach = [c.phone && `Tel: ${c.phone}`, c.email && `Email: ${c.email}`].filter(Boolean).join("  ·  ");
  return [c.address, reach, c.hours && `Clinic Hours: ${c.hours}`]
    .map((l) => (l ?? "").trim())
    .filter(Boolean);
}

/** `layout` is the sheets as `fitSheets` laid them out; without it the rows go a fixed
 * number to a sheet. `measuring` renders for `printReport` to take measurements from. */
export function buildReportHtml(doc: ReportDoc, origin = "", layout?: TableChunk[][], measuring = false): string {
  const perPage = doc.rowsPerPage ?? ROWS_PER_PAGE;
  const tables = tablesOf(doc);
  const sheets = layout ?? paginateTables(tables, perPage);
  const total = tables.reduce((n, t) => n + t.rows.length, 0);
  const plain = tables.length === 1 && !tables[0].heading;

  // Only what isn't already on the sheet. Who prepared it is signed for at the bottom,
  // and the record count is in the footer of every sheet — printing either one twice
  // just crowds the header above the table.
  const meta = [
    { label: "Date Generated", value: doc.generatedAt },
    ...(doc.filters ?? []),
  ];

  const header = `
    <div class="letterhead">
      <img src="${esc(origin)}/clinic-logo.png" alt="">
      <div>
        <p class="clinic">${esc(doc.clinic?.name?.trim() || "Ayag Dental Clinic")}</p>
        ${contactLines(doc.clinic).map((l) => `<p class="contact">${esc(l)}</p>`).join("")}
      </div>
    </div>
    <h2>${esc(doc.title)}</h2>
    <dl class="meta">
      ${meta.map((m) => `<div><dt>${esc(m.label)}:</dt><dd>${esc(m.value)}</dd></div>`).join("")}
    </dl>`;

  const chunkHtml = ({ table, rows, start, continued }: TableChunk) => {
    const fits = table.columns.map(columnFit);
    const aligns = table.columns.map((c) => ({ number: "al-r", code: "al-c", text: "" })[columnKind(c)]);
    const classes = (...names: (string | undefined)[]) => {
      const list = names.filter(Boolean).join(" ");
      return list ? ` class="${list}"` : "";
    };
    const cls = (i: number) => classes(fits[i], aligns[i]);
    const body = rows.length
      ? rows.map((r, n) => `<tr><td class="num">${start + n + 1}</td>${r.map((c, i) => `<td${cls(i)}>${esc(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${table.columns.length + 1}">${esc(table.emptyText ?? "No records.")}</td></tr>`;

    const heading = table.heading
      ? `<h3>${esc(table.heading)}${continued ? " (continued)" : ""}${
          rows.length && !continued ? ` — ${table.rows.length}` : ""}</h3>`
      : "";

    return `${heading}<table>
      <thead><tr><th class="num">#</th>${table.columns.map((c, i) => `<th${fits[i] === "nowrap" ? classes(aligns[i]) : cls(i)}>${esc(c)}</th>`).join("")}</tr></thead>
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

  return `<!doctype html><html${measuring ? ' class="measuring"' : ""}><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
    <style>${STYLES}</style></head><body>${rendered.join("")}</body></html>`;
}

const outerHeight = (el: Element | null | undefined) => {
  if (!el) return 0;
  const cs = el.ownerDocument.defaultView?.getComputedStyle(el);
  return el.getBoundingClientRect().height + (parseFloat(cs?.marginTop ?? "") || 0) + (parseFloat(cs?.marginBottom ?? "") || 0);
};

/** Takes the heights `fitSheets` needs from a measuring render of `sheets`. Null when
 * there's no real layout to measure. */
function measure(frameDoc: Document, tables: ReportTable[], sheets: TableChunk[][]): SheetMetrics | null {
  const els = [...frameDoc.querySelectorAll<HTMLElement>("section.sheet")];
  if (!els.length) return null;
  const first = els[0];
  const meta = first.querySelector(".meta");
  const metaGap = meta ? parseFloat(frameDoc.defaultView?.getComputedStyle(meta).marginBottom ?? "") || 0 : 0;
  const header = meta ? meta.getBoundingClientRect().bottom + metaGap - first.getBoundingClientRect().top : 0;
  const m: SheetMetrics = {
    header,
    foot: outerHeight(first.querySelector(".foot")),
    signature: outerHeight(frameDoc.querySelector(".sign")),
    tables: tables.map(() => ({ heading: 0, thead: 0, rows: [] })),
  };

  els.forEach((el, s) => {
    const tableEls = [...el.querySelectorAll("table")];
    (sheets[s] ?? []).forEach((chunk, c) => {
      const t = m.tables[tables.indexOf(chunk.table)];
      const tableEl = tableEls[c];
      if (!t || !tableEl) return;
      const h3 = tableEl.previousElementSibling;
      // Counted with the gap above it, even where it opens a sheet and has none.
      if (chunk.table.heading && h3?.tagName === "H3") t.heading = Math.max(t.heading, h3.getBoundingClientRect().height + 16);
      t.thead = Math.max(t.thead, tableEl.tHead?.getBoundingClientRect().height ?? 0);
      [...(tableEl.tBodies[0]?.rows ?? [])].forEach((tr, n) => {
        const i = chunk.rows.length ? chunk.start + n : 0;
        t.rows[i] = Math.max(t.rows[i] ?? 0, tr.getBoundingClientRect().height);
      });
    });
  });

  const measured = m.header > 0 && m.tables.some((t) => t.rows.some((h) => h > 0));
  return measured ? m : null;
}

/** Where a layout's sheets break, to tell when refitting has stopped changing it. */
const breaksOf = (tables: ReportTable[], sheets: TableChunk[][]) =>
  sheets.map((s) => s.map((c) => `${tables.indexOf(c.table)}:${c.start}+${c.rows.length}`).join(",")).join("|");

/** Lays the document out to fill each sheet: renders it in `frameDoc` (which must be the
 * printed page's width), measures every row, and fits the sheets to those heights.
 *
 * A table sizes its columns to the rows it holds, so the same row can wrap in one sheet's
 * table and not in another's. Each layout is therefore rendered and measured as it will
 * print, and refitted to those heights, until it no longer changes. Null when nothing can
 * be measured, or no layout settles without a sheet running over: the fixed count, sized
 * for the worst case, prints instead. */
export function layoutSheets(doc: ReportDoc, frameDoc: Document, origin = ""): TableChunk[][] | null {
  const tables = tablesOf(doc);
  const render = (sheets: TableChunk[][]) => {
    frameDoc.open();
    frameDoc.write(buildReportHtml(doc, origin, sheets, true));
    frameDoc.close();
  };
  const fitsOnSheets = () =>
    [...frameDoc.querySelectorAll<HTMLElement>("section.sheet")].every((el) => el.getBoundingClientRect().height <= SHEET_BUDGET_PX + 1);

  let sheets: TableChunk[][] = [tables.map((table) => ({ table, rows: table.rows, start: 0, continued: false }))];
  render(sheets);
  let m = measure(frameDoc, tables, sheets);
  if (!m) return null;

  let lastGood: TableChunk[][] | null = null;
  for (let pass = 0; pass < 8; pass++) {
    sheets = fitSheets(tables, m);
    render(sheets);
    const ok = fitsOnSheets();
    if (ok) lastGood = sheets;
    m = measure(frameDoc, tables, sheets);
    if (!m) break;
    // Settled: measured as it will print, it fits, and refitting would change nothing.
    if (ok && breaksOf(tables, fitSheets(tables, m)) === breaksOf(tables, sheets)) return sheets;
  }
  return lastGood;
}

/** Prints via a hidden iframe rather than window.open(), so no popup blocker can stop it. */
export function printReport(doc: ReportDoc): boolean {
  const iframe = document.createElement("iframe");
  // Off-screen at the printed page's width (A4 less its 14mm margins) while the rows are
  // measured, so they wrap here as they will on paper.
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:182mm;height:600px;border:0;visibility:hidden";
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!frameDoc) {
    document.body.removeChild(iframe);
    return false;
  }

  let layout: TableChunk[][] | null = null;
  try {
    layout = doc.rowsPerPage ? null : layoutSheets(doc, frameDoc, window.location.origin);
  } catch {
    layout = null; // filling the sheets is a nicety; the fixed count still prints soundly
  }
  const html = buildReportHtml(doc, window.location.origin, layout ?? undefined);
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";

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
