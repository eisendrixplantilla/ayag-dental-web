import { describe, expect, it } from "vitest";
import { newestFirst } from "@/lib/newest";
import { groupGuests, guestSince } from "@/lib/guests";
import type { Appointment } from "@/lib/api/appointments";

describe("newestFirst", () => {
  it("puts the newest on top, undated last, and keeps same-day order", () => {
    const rows = [
      { n: "old", d: "2026-01-05" },
      { n: "none", d: null },
      { n: "new-a", d: "2026-11-04" },
      { n: "mid", d: "2026-06-01T10:00:00Z" },
      { n: "new-b", d: "2026-11-04" },
      { n: "dash", d: "—" },
    ];
    expect(newestFirst(rows, (r) => r.d).map((r) => r.n)).toEqual(["new-a", "new-b", "mid", "old", "none", "dash"]);
  });

  it("dates a guest by their first booking, in Manila time", () => {
    const visit = (createdAt: string, date: string) =>
      ({ patientId: null, patientName: "Ana", contact: "0917", date, time: "09:00", createdAt }) as Appointment;
    // 2026-03-01 17:30 UTC is already March 2 in Manila.
    const [g] = groupGuests([visit("2026-05-10T02:00:00Z", "2026-05-12"), visit("2026-03-01T17:30:00Z", "2026-03-03")]);
    expect(guestSince(g)).toBe("2026-03-02");
  });
});
