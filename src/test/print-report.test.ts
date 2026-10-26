import { describe, expect, it } from "vitest";
import { buildReportHtml, columnFit, contactLines, fitSheets, paginate, ROWS_PER_PAGE, tablesOf, type SheetMetrics } from "@/lib/printReport";
import { describeClinicHours } from "@/lib/clinicHours";

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
  it("puts fifteen records on a page by default", () => {
    // Fifteen is what an A4 sheet holds at the document's type size, with the clinic's
    // details on the letterhead, the signature block and rows wrapping to two lines.
    expect(ROWS_PER_PAGE).toBe(15);
    expect(paginate(rows(45)).map(p => p.length)).toEqual([15, 15, 15]);
  });

  it("takes a different page size when one is asked for", () => {
    expect(paginate(rows(25), 10).map(p => p.length)).toEqual([10, 10, 5]);
    expect(sheets(buildReportHtml(doc(25, { rowsPerPage: 10 })))).toBe(3);
  });

  it("still makes one page out of an empty report", () => {
    expect(paginate([])).toEqual([[]]);
  });

  it("prints a sheet per fifteen records", () => {
    expect(sheets(buildReportHtml(doc(15)))).toBe(1);
    expect(sheets(buildReportHtml(doc(16)))).toBe(2);
    expect(sheets(buildReportHtml(doc(45)))).toBe(3);
  });

  it("splits the records across those sheets, in order and numbered", () => {
    const parts = bodyRows(buildReportHtml(doc(20)));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("Patient 1");
    expect(parts[0]).toContain("Patient 15");
    expect(parts[0]).not.toContain("Patient 16");
    expect(parts[1]).toContain("Patient 16");
    expect(parts[1]).toContain(">20</td>"); // the running record number
  });

  it("numbers every page and says which records are on it", () => {
    const html = buildReportHtml(doc(45));
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain("Page 3 of 3");
    expect(html).toContain("Records 1–15 of 45");
    expect(html).toContain("Records 31–45 of 45");
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
      tables: [{ heading: "Appointment History", columns: ["Date"], rows: rows(24).map(r => [r[0]]) }],
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
    expect(html).toContain("Records 1–15 of 45");
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

describe("columns left off paper", () => {
  it("drops Reference and Type from every printed table, keeping the rest in line", () => {
    const html = buildReportHtml({
      ...doc(0),
      tables: [
        { columns: ["Reference", "Patient Name", "Type", "Status"], rows: [["APT-1", "Rosa Mendoza", "Walk-in", "Completed"]] },
        { heading: "Other", columns: ["Date", "Type"], rows: [["2026-10-01", "Online"]] },
      ],
    });
    expect(html).not.toMatch(/<th>(Reference|Type)<\/th>/);
    expect(html).not.toContain("APT-1");
    expect(html).not.toContain("Walk-in");
    expect(bodyRows(html)[0]).toContain('<td class="name">Rosa Mendoza</td><td class="nowrap al-c">Completed</td></tr>');
    expect(bodyRows(html)[1]).toContain('<td class="nowrap al-c">2026-10-01</td></tr>');
  });
});

describe("fitting a sheet and its columns", () => {
  it("leaves slack under a full A4 sheet, so a browser that measures the page smaller doesn't spill the footer onto a blank page", () => {
    const minHeight = Number(buildReportHtml(doc(1)).match(/\.sheet \{[^}]*min-height: (\d+)mm/)![1]);
    expect(minHeight).toBeLessThanOrEqual(297 - 2 * 14 - 10);
  });

  it("gives names room, keeps short values on one line, and lets emails break", () => {
    expect(["Patient Name", "Patient", "Dentist", "Full Name"].map(columnFit)).toEqual(["name", "name", "name", "name"]);
    expect(["Appointment Date", "Time", "Contact Number", "Status", "Date Registered"].map(columnFit)).toEqual(Array(5).fill("nowrap"));
    expect(columnFit("Email Address")).toBe("breakable");
    expect(columnFit("Service")).toBe("");
  });
});

describe("the clinic's details on the letterhead", () => {
  const clinic = {
    name: "Ayag Dental Clinic",
    address: "123 Rizal St., Cabanatuan City",
    phone: "0917 123 4567",
    email: "info@ayagdental.com",
    hours: "Mon–Fri 9:00 AM–5:00 PM · Sun Closed",
  };

  it("prints the address, how to reach the clinic and its hours under the name, on every sheet", () => {
    const html = buildReportHtml(doc(30, { clinic }));
    expect(html.split("123 Rizal St., Cabanatuan City").length - 1).toBe(2);
    expect(html).toContain("Tel: 0917 123 4567  ·  Email: info@ayagdental.com");
    expect(html).toContain("Clinic Hours: Mon–Fri 9:00 AM–5:00 PM · Sun Closed");
  });

  it("leaves off whatever the clinic hasn't filled in", () => {
    expect(contactLines({ phone: "0917 123 4567", address: " ", email: null })).toEqual(["Tel: 0917 123 4567"]);
    expect(contactLines(null)).toEqual([]);
    expect(buildReportHtml(doc(1))).not.toContain('class="contact"');
  });
});

describe("wording the clinic hours", () => {
  it("runs days with the same hours together, and says which days it's closed", () => {
    const day = (d: string, open: string, close: string, enabled = true) => ({ day: d, open, close, enabled });
    expect(describeClinicHours([
      day("Monday", "09:00", "17:00"), day("Tuesday", "09:00", "17:00"), day("Wednesday", "09:00:00", "17:00:00"),
      day("Thursday", "09:00", "17:00"), day("Friday", "09:00", "17:00"),
      day("Saturday", "08:30", "12:00"), day("Sunday", "00:00", "00:00", false),
    ])).toBe("Mon–Fri 9:00 AM–5:00 PM · Sat 8:30 AM–12:00 PM · Sun Closed");
  });
});

describe("filling each sheet to its foot", () => {
  // A sheet of 1000px: 200 above the table, 40 for the foot, 100 for the signature,
  // 20 for the column row, so 740px is left for rows.
  const metrics = (rowHeights: number[], extra: Partial<SheetMetrics> = {}): SheetMetrics => ({
    header: 200, foot: 40, signature: 100,
    tables: [{ heading: 0, thead: 20, rows: rowHeights }],
    ...extra,
  });
  const counts = (s: ReturnType<typeof fitSheets>) => s.map((chunks) => chunks.reduce((n, c) => n + c.rows.length, 0));

  it("takes as many one-line rows as fit, not a fixed fifteen", () => {
    const tables = tablesOf(doc(60));
    const s = fitSheets(tables, metrics(Array(60).fill(20)), 1000);
    expect(counts(s)).toEqual([37, 23]);
    expect(s[1][0].start).toBe(37);
  });

  it("takes fewer rows on a sheet where names wrap", () => {
    const tables = tablesOf(doc(40));
    const heights = [...Array(20).fill(40), ...Array(20).fill(20)];
    expect(counts(fitSheets(tables, metrics(heights), 1000))[0]).toBe(18);
  });

  it("carries the last rows over with the signature rather than printing it alone", () => {
    const tables = tablesOf(doc(37));
    const s = fitSheets(tables, metrics(Array(37).fill(20)), 1000);
    expect(counts(s)).toEqual([35, 2]);
    expect(s[1][0]).toMatchObject({ start: 35, continued: true });
  });

  it("still gives an empty report a sheet", () => {
    const tables = tablesOf(doc(0));
    expect(fitSheets(tables, metrics([30]), 1000)).toEqual([[{ table: tables[0], rows: [], start: 0, continued: false }]]);
  });

  it("prints the sheets it was given", () => {
    const tables = tablesOf(doc(45));
    const layout = fitSheets(tables, metrics(Array(45).fill(20)), 1000);
    const html = buildReportHtml(doc(45), "", layout);
    expect(sheets(html)).toBe(2);
    expect(html).toContain("Records 1–37 of 45");
    expect(html).toContain("Records 38–45 of 45");
  });
});

describe("the clinic's alignment rules on paper", () => {
  it("puts numbers right, codes, dates and statuses in the middle, and text left", () => {
    const html = buildReportHtml({
      ...doc(0),
      tables: [{ columns: ["Patient Name", "Patient ID", "Age", "Status"], rows: [["Rosa Mendoza", "PT-26100001", "32", "Active"]] }],
    });
    expect(html).toContain('<th class="name">Patient Name</th>');
    expect(html).toMatch(/<th class="[^"]*al-c">Patient ID<\/th>/);
    expect(html).toMatch(/<th class="[^"]*al-r">Age<\/th>/);
    expect(bodyRows(html)[0]).toMatch(/<td class="[^"]*al-r">32<\/td><td class="[^"]*al-c">Active<\/td>/);
  });
});

describe("what the print tour turned up", () => {
  it("reads Account as a word, not a count, and a weekday column as a date", async () => {
    const { columnKind } = await import("@/lib/tableClass");
    expect(columnKind("Account")).toBe("code");
    expect(columnKind("Visit Count")).toBe("number");
    expect(columnKind("Mon Oct 26")).toBe("code");
  });

  it("keeps IDs and 'No account' on one line, and lets a Dates range wrap", () => {
    expect(["Patient ID", "Employee ID", "Account"].map(columnFit)).toEqual(["nowrap", "nowrap", "nowrap"]);
    expect(columnFit("Dates")).toBe("");
  });

  it("leaves the count off a heading that asks for it, like a week's seven days", () => {
    const html = buildReportHtml({
      ...doc(0),
      tables: [
        { heading: "Weekly Schedule", showCount: false, columns: ["Day"], rows: [["Monday"], ["Tuesday"]] },
        { heading: "Leave", columns: ["Dates"], rows: [["Nov 2"]] },
      ],
    });
    expect(html).toContain("<h3>Weekly Schedule</h3>");
    expect(html).toContain("<h3>Leave — 1</h3>");
  });
});
