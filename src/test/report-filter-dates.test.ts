import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, matchesReportFilter } from "@/lib/reportFilter";

const row = ["Juan Dela Cruz", "2026-09-25", "Filling"];
const typed = (value: string, field = EMPTY_FILTER.field) => ({ ...EMPTY_FILTER, field, value });

describe("searching for a date as the page shows it", () => {
  it("finds a row by the date written out, as the table displays it", () => {
    expect(matchesReportFilter(row, typed("Sep 25"))).toBe(true);
    expect(matchesReportFilter(row, typed("sep 25, 2026"))).toBe(true);
    expect(matchesReportFilter(row, typed("September"))).toBe(true);
  });

  it("still finds it by the stored form", () => {
    expect(matchesReportFilter(row, typed("2026-09"))).toBe(true);
  });

  it("doesn't match a different day", () => {
    expect(matchesReportFilter(row, typed("Sep 26"))).toBe(false);
  });

  it("works when searching that one column", () => {
    expect(matchesReportFilter(row, typed("Sep 25", "1"))).toBe(true);
    expect(matchesReportFilter(row, typed("Sep 25", "0"))).toBe(false);
  });
});
