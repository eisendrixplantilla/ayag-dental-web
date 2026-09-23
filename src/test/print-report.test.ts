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
  it("puts ten records on a page by default", () => {
    expect(ROWS_PER_PAGE).toBe(10);
    expect(paginate(rows(25)).map(p => p.length)).toEqual([10, 10, 5]);
  });

  it("still makes one page out of an empty report", () => {
    expect(paginate([])).toEqual([[]]);
  });

  it("prints a sheet per ten records", () => {
    expect(sheets(buildReportHtml(doc(10)))).toBe(1);
    expect(sheets(buildReportHtml(doc(11)))).toBe(2);
    expect(sheets(buildReportHtml(doc(25)))).toBe(3);
  });

  it("splits the records across those sheets, in order and numbered", () => {
    const parts = bodyRows(buildReportHtml(doc(12)));
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("Patient 1");
    expect(parts[0]).toContain("Patient 10");
    expect(parts[0]).not.toContain("Patient 11");
    expect(parts[1]).toContain("Patient 11");
    expect(parts[1]).toContain(">12</td>"); // the running record number
  });

  it("numbers every page and says which records are on it", () => {
    const html = buildReportHtml(doc(25));
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain("Page 3 of 3");
    expect(html).toContain("Records 1–10 of 25");
    expect(html).toContain("Records 21–25 of 25");
  });

  it("repeats the letterhead and column headings on each sheet", () => {
    const html = buildReportHtml(doc(25));
    expect(html.split("Ayag Dental Clinic").length - 1).toBe(3);
    expect(html.split("<thead>").length - 1).toBe(3);
  });
});

describe("what the document says", () => {
  it("carries the date it was generated and who prepared it", () => {
    const html = buildReportHtml(doc(3));
    expect(html).toContain("Date Generated");
    expect(html).toContain("Sep 24, 2026, 2:35 AM");
    expect(html).toContain("Prepared By");
    expect(html).toContain("Dr. Sarah Chen (Clinic Admin)");
    expect(html).toContain("Total Records");
  });

  it("signs off once, on the last sheet only", () => {
    const html = buildReportHtml(doc(25));
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
