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
    for (const name of ["Restoration", "EXO (Bunot)", "Root Canal", "Oral Prophylaxis", null, undefined, ""]) {
      expect(displayService(name as string)).toBe(name);
    }
  });

  it("still finds the old rows, so the correction doesn't create a second service", () => {
    // Both misspellings point at the one row, whichever it happens to be saved as.
    expect(legacyNames("Veneers").sort()).toEqual(["Veeners", "Venners"]);
    expect(legacyNames("Restoration")).toEqual([]);
  });

  it("is spelled correctly in the list used when the clinic's own can't be loaded", () => {
    expect(FALLBACK_SERVICES).toContain("Veneers");
    expect(FALLBACK_SERVICES).not.toContain("Veeners");
  });
});

// The clinic calls its cleaning service Oral Prophylaxis; it was saved as "Oral".
describe("Oral, now Oral Prophylaxis", () => {
  it("reads as Oral Prophylaxis wherever it was saved as Oral", () => {
    expect(displayService("Oral")).toBe("Oral Prophylaxis");
  });

  it("is renamed inside a visit's list of services too", () => {
    expect(displayService("Oral, Restoration")).toBe("Oral Prophylaxis, Restoration");
    expect(displayService("Veeners, Oral")).toBe("Veneers, Oral Prophylaxis");
  });

  it("still finds the row saved as Oral, so no second service is made beside it", () => {
    expect(legacyNames("Oral Prophylaxis")).toEqual(["Oral"]);
  });

  it("is offered under its new name when the clinic's own list can't be loaded", () => {
    expect(FALLBACK_SERVICES).toContain("Oral Prophylaxis");
    expect(FALLBACK_SERVICES).not.toContain("Oral");
  });
});

// The home page lists the services on its own, so its spelling is checked against the
// clinic's list: it once offered "Veeners".
describe("the services on the home page", () => {
  it("are spelled as the clinic spells them", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const source = fs.readFileSync(path.resolve(__dirname, "../pages/Landing.tsx"), "utf8");
    const names = [...source.matchAll(/\{ name: "([^"]+)", icon:/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n) => !FALLBACK_SERVICES.includes(n))).toEqual([]);
    expect([...FALLBACK_SERVICES].sort()).toEqual([...names].sort());
  });
});
