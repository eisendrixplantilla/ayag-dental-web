import { describe, expect, it } from "vitest";
import { buildReportHtml, paginate, ROWS_PER_PAGE } from "@/lib/printReport";

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => [`APT-00000${i + 1}`, `Patient ${i + 1}`, "Dr. Mike Johnson"]);

const doc = (n: number, over = {}) => ({
  title: "Appointment Report",
  columns: ["Reference", "Patient Name", "Dentist"],
  rows: rows(n),
  generatedAt: "Sep 24, 2026, 2:35 AM",
  preparedBy: { name: "Dr. Sarah Chen", role: "Clinic Admin" },
  ...over,
});

const sheets = (html: string) => html.split('<section class="sheet">').length - 1;
const bodyRows = (html: string) => html.split("<tbody>").slice(1).map(part => part.split("</tbody>")[0]);

describe("paginating a report", () => {
  it("puts eighteen records on a page by default", () => {
    // Eighteen is what an A4 sheet holds at the document's type size, with the
    // signature block and rows wrapping to two lines.
    expect(ROWS_PER_PAGE).toBe(18);
    expect(paginate(rows(45)).map(p => p.length)).toEqual([18, 18, 9]);
  });

  it("takes a different page size when one is asked for", () => {
    expect(paginate(rows(25), 10).map(p => p.length)).toEqual([10, 10, 5]);
    expect(sheets(buildReportHtml(doc(25, { rowsPerPage: 10 })))).toBe(3);
  });

  it("still makes one page out of an empty report", () => {
    expect(paginate([])).toEqual([[]]);
  });

  it("prints a sheet per eighteen records", () => {
    expect(sheets(buildReportHtml(doc(18)))).toBe(1);
    expect(sheets(buildReportHtml(doc(19)))).toBe(2);
    expect(sheets(buildReportHtml(doc(45)))).toBe(3);
  });

  it("splits the records across those sheets, in order and numbered", () => {
    const parts = bodyRows(buildReportHtml(doc(20)));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("Patient 1");
    expect(parts[0]).toContain("Patient 18");
    expect(parts[0]).not.toContain("Patient 19");
    expect(parts[1]).toContain("Patient 19");
    expect(parts[1]).toContain(">20</td>"); // the running record number
  });

  it("numbers every page and says which records are on it", () => {
    const html = buildReportHtml(doc(45));
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain("Page 3 of 3");
    expect(html).toContain("Records 1–18 of 45");
    expect(html).toContain("Records 37–45 of 45");
  });

  it("repeats the letterhead and column headings on each sheet", () => {
    const html = buildReportHtml(doc(45));
    expect(html.split("Ayag Dental Clinic").length - 1).toBe(3);
    expect(html.split("<thead>").length - 1).toBe(3);
  });
});

describe("what the document says", () => {
  it("carries the date it was generated, and signs for who prepared it", () => {
    const html = buildReportHtml(doc(3));
    expect(html).toContain("Date Generated");
    expect(html).toContain("Sep 24, 2026, 2:35 AM");
    // Named once, in the signature block -- not repeated in the header above the table.
    expect(html).toContain("Dr. Sarah Chen");
    expect(html).toContain("Clinic Admin");
    expect(html).not.toContain("Prepared By:");
  });

  it("leaves out what is already elsewhere on the sheet", () => {
    const html = buildReportHtml(doc(3));
    // The count lives in the footer of every sheet, so the header doesn't repeat it.
    expect(html).not.toContain("Total Records");
    expect(html).toContain("of 3");
    // The strapline under the clinic name said nothing a reader needed.
    expect(html).not.toContain("Dental Clinic Management System");
  });

  it("signs off once, on the last sheet only", () => {
    const html = buildReportHtml(doc(45));
    expect(html.split('class="sign"').length - 1).toBe(1);
    expect(html.indexOf('class="sign"')).toBeGreaterThan(html.lastIndexOf("Page 2 of 3"));
  });

  it("lists the filters it was run with", () => {
    const html = buildReportHtml(doc(2, {
      filters: [{ label: "Date Range", value: "2026-09-01 to 2026-09-30" }, { label: "Dentist", value: "All dentists" }],
    }));
    expect(html).toContain("Date Range");
    expect(html).toContain("2026-09-01 to 2026-09-30");
    expect(html).toContain("All dentists");
  });

  it("prints a proper empty document rather than nothing", () => {
    const html = buildReportHtml(doc(0));
    expect(sheets(html)).toBe(1);
    expect(html).toContain("No records found for these filters.");
    expect(html).toContain("Page 1 of 1");
  });

  it("escapes anything a patient typed into their own name", () => {
    const html = buildReportHtml(doc(0, { rows: [["APT-1", '<script>alert("x")</script>', "Dr. Mike"]] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// ---------------------------------------------------------------------------
// Pages that aren't a plain list (a patient's history, a dashboard, settings)
// print the same document, with a heading per section.

const sectionDoc = (over = {}) => ({
  title: "Patient History",
  tables: [
    {
      heading: "Appointment History",
      columns: ["Date", "Service"],
      rows: [["2026-09-20", "Oral"], ["2026-09-25", "Root Canal"]],
      emptyText: "No appointments yet.",
    },
    {
      heading: "Dental Records",
      columns: ["Date", "Diagnosis"],
      rows: [["2026-09-20", "Caries"]],
      emptyText: "No dental records yet.",
    },
  ],
  generatedAt: "Sep 24, 2026, 2:35 AM",
  preparedBy: { name: "Dr. Sarah Chen", role: "Clinic Admin" },
  ...over,
});

describe("a document made of several sections", () => {
  it("keeps the letterhead, the meta and the signature of a report", () => {
    const html = buildReportHtml(sectionDoc());
    expect(html).toContain("Ayag Dental Clinic");
    expect(html).toContain("Dr. Sarah Chen");
    expect(html).toContain("Sep 24, 2026, 2:35 AM");
    expect(html).toContain('class="sign"');
    expect(html).toContain("Page 1 of 1");
  });

  it("heads each section and counts the lot", () => {
    const html = buildReportHtml(sectionDoc());
    expect(html).toContain("Appointment History");
    expect(html).toContain("Dental Records");
    expect(html.split("<thead>").length - 1).toBe(2); // a column row per section
    expect(html).toContain("Total records: 3");
  });

  it("says what is missing in the section's own words", () => {
    const html = buildReportHtml(sectionDoc({
      tables: [
        { heading: "Appointment History", columns: ["Date"], rows: [], emptyText: "No appointments yet." },
        { heading: "Dental Records", columns: ["Date"], rows: [], emptyText: "No dental records yet." },
      ],
    }));
    expect(html).toContain("No appointments yet.");
    expect(html).toContain("No dental records yet.");
    expect(html).not.toContain("No records found for these filters.");
  });

  it("numbers each section's rows from one", () => {
    const html = buildReportHtml(sectionDoc());
    const [appointments, records] = html.split("<tbody>").slice(1).map(p => p.split("</tbody>")[0]);
    expect(appointments).toContain('class="num">1<');
    expect(appointments).toContain('class="num">2<');
    expect(records).toContain('class="num">1<');
    expect(records).not.toContain('class="num">2<');
  });

  it("carries a long section onto the next sheet, saying it continues", () => {
    const html = buildReportHtml(sectionDoc({
      tables: [{ heading: "Appointment History", columns: ["Date"], rows: rows(30).map(r => [r[0]]) }],
    }));
    expect(sheets(html)).toBe(2);
    expect(html).toContain("Appointment History (continued)");
    expect(html).toContain("Page 2 of 2");
  });

  it("starts a section on a fresh sheet rather than orphaning its heading", () => {
    const html = buildReportHtml(sectionDoc({
      tables: [
        { heading: "Appointment History", columns: ["Date"], rows: rows(18).map(r => [r[0]]) },
        { heading: "Dental Records", columns: ["Date"], rows: [["2026-09-20"]] },
      ],
    }));
    const [first, second] = html.split('<section class="sheet">').slice(1);
    expect(first).not.toContain("Dental Records");
    expect(second).toContain("Dental Records");
  });

  it("leaves a plain list exactly as it was", () => {
    const html = buildReportHtml(doc(45));
    expect(sheets(html)).toBe(3); // still twenty to a sheet, no heading eating into it
    expect(html).toContain("Records 1–18 of 45");
    expect(html).not.toContain("<h3>");
  });
});

describe("how big the document is set", () => {
  const styles = () => {
    const html = buildReportHtml(doc(3));
    return html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  };

  it("sets every size in points, the unit a printer works in", () => {
    // The px sizes this used to carry came out around 7.5pt on paper.
    const pxSizes = styles().match(/font-size:\s*[\d.]+px/g) ?? [];
    expect(pxSizes).toEqual([]);
  });

  it("sets the body and the tables at a readable size", () => {
    const css = styles();
    const sizeOf = (selector: string) => {
      const escaped = selector.replace(/[.]/g, "\\.");
      const block = new RegExp(escaped + "\\s*\\{[^}]*font-size:\\s*([0-9.]+)pt").exec(css);
      return block ? Number(block[1]) : 0;
    };
    expect(sizeOf("body")).toBeGreaterThanOrEqual(10.5);
    expect(sizeOf("table")).toBeGreaterThanOrEqual(10);
    expect(sizeOf("th")).toBeGreaterThanOrEqual(10);
    expect(sizeOf(".meta")).toBeGreaterThanOrEqual(10);
    // The title still stands above the body text it heads.
    expect(sizeOf("h2")).toBeGreaterThan(sizeOf("body"));
    expect(sizeOf(".clinic")).toBeGreaterThan(sizeOf("h2"));
  });
});
