import { describe, expect, it } from "vitest";
import { columnKind, describeSort, nextSort, sortByColumn } from "@/lib/tableSort";

const by = (rows: string[][], col: number, dir: "asc" | "desc") =>
  sortByColumn(rows, (r) => r, { col, dir }).map((r) => r[col]);

describe("sorting a table by a column", () => {
  it("tells what a column holds from its text", () => {
    expect(columnKind(["2026-10-01", "2026-09-30", "—"])).toBe("date");
    expect(columnKind(["9:00 AM – 9:30 AM", "1:00 PM", "10:30"])).toBe("time");
    expect(columnKind(["₱1,500", "300", "20"])).toBe("number");
    expect(columnKind(["Rosa", "2026-10-01"])).toBe("text");
  });

  it("puts names A to Z, ignoring case", () => {
    expect(by([["maria"], ["Ana"], ["Pedro"]], 0, "asc")).toEqual(["Ana", "maria", "Pedro"]);
    expect(by([["maria"], ["Ana"], ["Pedro"]], 0, "desc")).toEqual(["Pedro", "maria", "Ana"]);
  });

  it("puts dates in time order, and times by the clock, not alphabetically", () => {
    expect(by([["2026-09-30"], ["2026-10-12"], ["2026-10-01"]], 0, "desc")).toEqual(["2026-10-12", "2026-10-01", "2026-09-30"]);
    expect(by([["1:00 PM"], ["9:00 AM – 9:30 AM"], ["10:30 AM"]], 0, "asc")).toEqual(["9:00 AM – 9:30 AM", "10:30 AM", "1:00 PM"]);
  });

  it("compares amounts and counts as numbers", () => {
    expect(by([["₱8,000"], ["₱500"], ["₱2,500"]], 0, "asc")).toEqual(["₱500", "₱2,500", "₱8,000"]);
  });

  it("keeps empty cells last either way, and ties in the table's own order", () => {
    expect(by([["—"], ["B"], ["A"]], 0, "asc")).toEqual(["A", "B", "—"]);
    expect(by([["—"], ["B"], ["A"]], 0, "desc")).toEqual(["B", "A", "—"]);
    const rows = [["x", "1"], ["x", "2"], ["a", "3"]];
    expect(sortByColumn(rows, (r) => r, { col: 0, dir: "desc" }).map((r) => r[1])).toEqual(["1", "2", "3"]);
  });

  it("cycles on clicks: first direction, reversed, then back to the table's order", () => {
    expect(nextSort(null, 1, "text")).toEqual({ col: 1, dir: "asc" });
    expect(nextSort({ col: 1, dir: "asc" }, 1, "text")).toEqual({ col: 1, dir: "desc" });
    expect(nextSort({ col: 1, dir: "desc" }, 1, "text")).toBeNull();
    // Dates start newest first.
    expect(nextSort(null, 0, "date")).toEqual({ col: 0, dir: "desc" });
    expect(nextSort({ col: 0, dir: "desc" }, 0, "date")).toEqual({ col: 0, dir: "asc" });
    // Another column starts over.
    expect(nextSort({ col: 0, dir: "asc" }, 2, "text")).toEqual({ col: 2, dir: "asc" });
  });

  it("says how a column is sorted in plain words", () => {
    expect(describeSort("date", "desc")).toBe("Newest first");
    expect(describeSort("text", "asc")).toBe("A to Z");
  });
});
