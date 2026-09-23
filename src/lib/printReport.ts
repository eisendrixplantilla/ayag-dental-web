/** Builds a printable, paginated report document and sends it to the printer.
 *
 * Printing the page itself gave whatever the screen happened to look like. A report is
 * a document: a letterhead, who prepared it and when, a fixed number of records per
 * page, and a page number on every sheet — so a printed copy can be filed, and so two
 * copies of the same report look the same.
 */

/** Records on one sheet. Kept small enough that a page never overflows. */
export const ROWS_PER_PAGE = 20;

export interface ReportDoc {
  /** e.g. "Appointment Report" */
  title: string;
  columns: string[];
  rows: string[][];
  /** Shown under the title, e.g. Date Range / Dentist / Status. */
  filters?: { label: string; value: string }[];
  preparedBy: { name: string; role: string };
  /** Manila date-time this report was generated. */
  generatedAt: string;
  rowsPerPage?: number;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ESCAPES[c]);

/** Splits rows into sheets. An empty report still gets one sheet, so it prints as a
 * proper "no records" document rather than nothing at all. */
export function paginate<T>(rows: T[], size: number = ROWS_PER_PAGE): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += size) pages.push(rows.slice(i, i + size));
  return pages;
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
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin: 0 0 12px; font-size: 10px; }
  .meta div { display: flex; gap: 6px; }
  .meta dt { color: #6b7280; margin: 0; }
  .meta dd { margin: 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
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
  const pages = paginate(doc.rows, perPage);
  const total = doc.rows.length;

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

  const sheets = pages.map((rows, i) => {
    const first = i * perPage;
    const body = rows.length
      ? rows.map((r, n) => `<tr><td class="num">${first + n + 1}</td>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")
      : `<tr><td class="empty" colspan="${doc.columns.length + 1}">No records found for these filters.</td></tr>`;

    const signature = i === pages.length - 1 ? `
      <div class="sign">
        <p>Prepared by:</p>
        <div class="line"></div>
        <p class="name">${esc(doc.preparedBy.name)}</p>
        <p class="role">${esc(doc.preparedBy.role)}</p>
      </div>` : "";

    const shown = rows.length ? `Records ${first + 1}–${first + rows.length} of ${total}` : "No records";

    return `<section class="sheet">
      ${header}
      <table>
        <thead><tr><th class="num">#</th>${doc.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${signature}
      <div class="foot"><span>${shown}</span><span>Page ${i + 1} of ${pages.length}</span></div>
    </section>`;
  });

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title>
    <style>${STYLES}</style></head><body>${sheets.join("")}</body></html>`;
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
