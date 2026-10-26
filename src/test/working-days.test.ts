import { describe, expect, it } from "vitest";
import { describeServiceHours, describeWorkingDays, initialsOf } from "@/lib/workingDays";
import { forServices, type DentistScheduleData } from "@/lib/api/staff";

const day = (dayOfWeek: number, start = "09:00", end = "17:00") => ({ dayOfWeek, start, end });

describe("a dentist's week in a line", () => {
  it("lists scattered days with their hours", () => {
    expect(describeWorkingDays([day(1), day(3), day(5)])).toEqual(["Mon, Wed, Fri · 9:00 AM–5:00 PM"]);
  });

  it("runs three or more days in a row together", () => {
    expect(describeWorkingDays([day(1), day(2), day(3), day(4), day(5)])).toEqual(["Mon–Fri · 9:00 AM–5:00 PM"]);
  });

  it("gives days with other hours a line of their own", () => {
    expect(describeWorkingDays([day(6, "09:00", "12:00"), day(1), day(2), day(3)])).toEqual([
      "Mon–Wed · 9:00 AM–5:00 PM",
      "Sat · 9:00 AM–12:00 PM",
    ]);
  });

  it("says nothing for a dentist with no schedule", () => {
    expect(describeWorkingDays([])).toEqual([]);
  });
});

describe("initials for a dentist without a photo", () => {
  it("leaves out the title", () => {
    expect(initialsOf("Dr. Mike Johnson")).toBe("MJ");
    expect(initialsOf("Aerhol Gocalin")).toBe("AG");
    expect(initialsOf("Dr Ayag")).toBe("A");
  });
});

describe("a service's own days and hours in a line", () => {
  it("gives the days and the hours", () => {
    expect(describeServiceHours({ days: [3, 1], start: "09:00", end: "12:00" })).toBe("Mon, Wed · 9:00 AM–12:00 PM");
  });

  it("says any working day when only hours are set", () => {
    expect(describeServiceHours({ days: [], start: "13:00", end: "15:00" })).toBe("Any working day · 1:00 PM–3:00 PM");
  });

  it("gives each day's number when there are any", () => {
    expect(describeServiceHours({ days: [1, 3, 5], start: null, end: null, dayLimits: { "1": 3, "3": 2 } }))
      .toBe("Mon (max 3), Wed (max 2), Fri");
  });

  it("says nothing when there's no restriction", () => {
    expect(describeServiceHours({ days: [], start: null, end: null })).toBeNull();
    expect(describeServiceHours(undefined)).toBeNull();
  });
});

describe("a dentist's week for one visit", () => {
  const week = (serviceHours: DentistScheduleData["serviceHours"]): DentistScheduleData => ({
    days: [1, 2, 3].map((dayOfWeek) => ({
      dayOfWeek, start: "08:00", end: "17:00", lunchStart: "12:00", lunchEnd: "13:00", duration: 30, maxPatients: 20,
    })),
    unavailable: [],
    serviceHours,
  });

  it("keeps only the service's days, and narrows the hours to its own", () => {
    const s = forServices(week([{ service: "Veneers", days: [1, 3], start: "09:00", end: "11:30" }]), ["Veneers"]);
    expect(s.days.map((d) => [d.dayOfWeek, d.start, d.end])).toEqual([[1, "09:00", "11:30"], [3, "09:00", "11:30"]]);
  });

  it("fits every service in the visit at once", () => {
    const s = forServices(week([
      { service: "Veneers", days: [], start: "09:00", end: "12:00" },
      { service: "Implant", days: [2, 3], start: "10:00", end: null },
    ]), ["Veneers", "Implant"]);
    expect(s.days.map((d) => [d.dayOfWeek, d.start, d.end])).toEqual([[2, "10:00", "12:00"], [3, "10:00", "12:00"]]);
  });

  it("drops a day where the hours don't overlap, and leaves other services' visits as they are", () => {
    const sched = week([{ service: "Veneers", days: [], start: "18:00", end: "19:00" }]);
    expect(forServices(sched, ["Veneers"]).days).toEqual([]);
    expect(forServices(sched, ["Oral"])).toBe(sched);
  });
});
