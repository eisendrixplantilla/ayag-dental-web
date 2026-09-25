import { describe, expect, it } from "vitest";
import { displayService, legacyNames } from "../../api/_lib/services";
import { FALLBACK_SERVICES } from "@/lib/services";

// "Veneers" has been stored under two wrong spellings over the years. Nothing is
// rewritten in the database; the corrected name is what everyone reads.
describe("a service that has been spelled wrong", () => {
  it("reads as Veneers whichever spelling it was saved under", () => {
    expect(displayService("Venners")).toBe("Veneers");
    expect(displayService("Veeners")).toBe("Veneers");
    expect(displayService("Veneers")).toBe("Veneers");
  });

  it("leaves every other service exactly as it is", () => {
    for (const name of ["Oral", "Restoration", "EXO (Bunot)", "Root Canal", null, undefined]) {
      expect(displayService(name as string)).toBe(name);
    }
  });

  it("still finds the old rows, so the correction doesn't create a second service", () => {
    // Both misspellings point at the one row, whichever it happens to be saved as.
    expect(legacyNames("Veneers").sort()).toEqual(["Veeners", "Venners"]);
    expect(legacyNames("Oral")).toEqual([]);
  });

  it("is spelled correctly in the list used when the clinic's own can't be loaded", () => {
    expect(FALLBACK_SERVICES).toContain("Veneers");
    expect(FALLBACK_SERVICES).not.toContain("Veeners");
  });
});
