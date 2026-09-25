import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COMPACT_TABLE, WRAP_CELL } from "@/lib/tableClass";

// A table that keeps the shared primitive's defaults is wider than it needs to be:
// `p-4` spends 32px a column on padding, and `TableHead`'s whitespace-nowrap lets a
// long heading set a column's floor. Every table opts out of both through COMPACT_TABLE.
const root = path.resolve(__dirname, "../..");
const pagesDir = path.join(root, "src/pages");
const files = fs
  .readdirSync(pagesDir, { recursive: true, encoding: "utf8" })
  .filter(f => f.endsWith(".tsx"))
  .map(f => path.join(pagesDir, f));

const read = (f: string) => fs.readFileSync(f, "utf8");
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");
const withTables = files.filter(f => /<Table[ >]/.test(read(f)));

describe("what the compact class covers", () => {
  it("tightens the padding and frees the headings", () => {
    expect(COMPACT_TABLE).toContain("[&_th]:px-2");
    expect(COMPACT_TABLE).toContain("[&_td]:px-2");
    expect(COMPACT_TABLE).toContain("[&_th]:whitespace-normal");
  });

  it("leaves the cells' own whitespace alone", () => {
    // `[&_td]:whitespace-normal` is a descendant selector and would outrank the
    // `whitespace-nowrap` a page puts on one cell, wrapping dates and time ranges.
    expect(COMPACT_TABLE).not.toContain("[&_td]:whitespace-normal");
    expect(WRAP_CELL).toBe("whitespace-normal break-words");
  });
});

describe("every table is compact", () => {
  it("found the tables to check", () => {
    expect(withTables.length).toBeGreaterThanOrEqual(14);
  });

  it("no table is left on the default padding", () => {
    const plain = withTables.filter(f => /<Table>/.test(read(f)));
    expect(plain.map(rel)).toEqual([]);
  });

  it("every table uses the shared class rather than its own copy", () => {
    const missing = withTables.filter(f => !read(f).includes("COMPACT_TABLE"));
    expect(missing.map(rel)).toEqual([]);
    // Nobody pastes the utilities inline any more.
    const inline = withTables.filter(f => /<Table className="\[&_th\]/.test(read(f)));
    expect(inline.map(rel)).toEqual([]);
  });

  it("gives the free-text columns somewhere to wrap", () => {
    // A table of names, services or emails that can't wrap holds itself open at the
    // width of its longest value, whatever the padding does.
    const textHeavy = [
      "src/pages/admin/AdminAccounts.tsx",
      "src/pages/admin/AdminPatients.tsx",
      "src/pages/admin/AdminInventory.tsx",
      "src/pages/admin/AdminReports.tsx",
      "src/pages/admin/AdminPatientHistory.tsx",
      "src/pages/dentist/DentistRecords.tsx",
      "src/pages/dentist/DentistAppointments.tsx",
      "src/pages/dentist/DentistPatientHistory.tsx",
      "src/pages/superadmin/SuperAdminStaff.tsx",
      "src/pages/superadmin/SuperAdminReports.tsx",
      "src/pages/superadmin/SuperAdminArchives.tsx",
    ];
    const missing = textHeavy.filter(f => !read(path.join(root, f)).includes("WRAP_CELL"));
    expect(missing).toEqual([]);
  });
});
