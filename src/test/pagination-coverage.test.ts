import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Every table in the system pages at ten rows. Rendering each page to prove it would be
// slow and would miss any page added later, so this reads the sources instead: a page
// that renders a table has to page it, and has to page only what's on screen.
const root = path.resolve(__dirname, "../..");
const pagesDir = path.join(root, "src/pages");

const pageFiles = fs
  .readdirSync(pagesDir, { recursive: true, encoding: "utf8" })
  .filter(f => f.endsWith(".tsx"))
  .map(f => path.join(pagesDir, f));

const read = (f: string) => fs.readFileSync(f, "utf8");
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");

/** Pages that render rows from a list. */
const withTables = pageFiles.filter(f => /<TableBody>|TableToolbar/.test(read(f)));

/** The catalogue is dragged into order, and a row can't be dragged onto a page that
 * isn't on screen — so its active list is deliberately whole. */
const NOT_PAGED = ["src/pages/superadmin/SuperAdminSettings.tsx"];

describe("every table pages at ten", () => {
  it("found the tables to check", () => {
    // A guard on the guard: if the pages move, this must not pass by finding nothing.
    expect(withTables.length).toBeGreaterThanOrEqual(14);
  });

  it("uses one page size everywhere, and it is ten", async () => {
    const { PAGE_SIZE } = await import("@/hooks/usePagination");
    expect(PAGE_SIZE).toBe(10);
    // Nobody hard-codes their own.
    const rogue = withTables.filter(f => /pageSize=\{(?!PAGE_SIZE)/.test(read(f)));
    expect(rogue.map(rel)).toEqual([]);
  });

  it("pages every table", () => {
    const missing = withTables
      .filter(f => !NOT_PAGED.includes(rel(f)))
      .filter(f => !read(f).includes("<TablePagination"));
    expect(missing.map(rel)).toEqual([]);
  });

  it("renders the page, not the whole list", () => {
    // A page bar over a list that still maps everything would page nothing.
    const notSliced = withTables
      .filter(f => read(f).includes("<TablePagination"))
      .filter(f => !/\bpaged\b/.test(read(f)));
    expect(notSliced.map(rel)).toEqual([]);
  });

  it("leaves the draggable catalogue whole, on purpose", () => {
    const settings = read(path.join(root, "src/pages/superadmin/SuperAdminSettings.tsx"));
    expect(settings).toContain("draggable");
    // Its active list maps `services` directly — not a page of them.
    expect(settings).toContain("{services.map(");
    // And it says why.
    expect(settings).toMatch(/not paged|cannot be dragged/i);
  });
});

describe("what paging must not shrink", () => {
  const printBuilders = withTables.filter(f => /usePrintDocument/.test(read(f)));

  it("found the pages that print", () => {
    expect(printBuilders.length).toBeGreaterThanOrEqual(8);
  });

  it("never builds a printed document out of the page on screen", () => {
    // `rows: paged...` would print ten rows and silently drop the rest.
    const truncated = printBuilders.filter(f => /rows:\s*paged|rows:\s*\w*\.paged/.test(read(f)));
    expect(truncated.map(rel)).toEqual([]);
  });

  it("never counts the page on screen in the toolbar", () => {
    // `shown={paged.length}` would report ten of everything.
    const miscounted = withTables.filter(f => /shown=\{[^}]*paged[^}]*\}/.test(read(f)));
    expect(miscounted.map(rel)).toEqual([]);
  });

  it("never sizes the page bar by the page it is showing", () => {
    // `total={paged.length}` would always be one page.
    const wrongTotal = withTables.filter(f => /total=\{[^}]*\bpaged\b[^}]*\}/.test(read(f)));
    expect(wrongTotal.map(rel)).toEqual([]);
  });
});
