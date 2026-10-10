import { describe, expect, it } from "vitest";
import { groupGuests, guestLabel } from "@/lib/guests";
import type { Appointment } from "@/lib/api/appointments";

const visit = (id: string, name: string, contact: string | null, date: string, patientId: string | null = null) =>
  ({ id, patientId, patientName: name, contact, date, time: "09:00" }) as Appointment;

describe("telling walk-in guests apart", () => {
  it("one guest per name and number, however the number was typed", () => {
    const groups = groupGuests([
      visit("a", "Rosa Mendoza", "0917 123 4567", "2026-09-20"),
      visit("b", "Rosa Mendoza", "0917-123-4567", "2026-10-05"),
      visit("c", "Rosa Mendoza", "0999 000 1111", "2026-10-01"), // a namesake
      visit("d", "Pedro Reyes", null, "2026-10-03"),
      visit("e", "Rosa Mendoza", "0917 123 4567", "2026-10-07", "acct-1"), // has an account: not a guest
    ]);
    expect(groups.map(g => [g.name, g.contact, g.visits.map(v => v.id)])).toEqual([
      ["Rosa Mendoza", "0917-123-4567", ["b", "a"]], // newest visit first, its number as written
      ["Pedro Reyes", null, ["d"]],
      ["Rosa Mendoza", "0999 000 1111", ["c"]],
    ]);
  });

  it("names a guest with their number when there is one", () => {
    expect(guestLabel({ name: "Rosa Mendoza", contact: "0917 123 4567" })).toBe("Rosa Mendoza (0917 123 4567)");
    expect(guestLabel({ name: "Pedro Reyes", contact: null })).toBe("Pedro Reyes");
  });
});
