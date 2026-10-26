import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayAvailability } from "@/lib/dayAvailability";
import type { DentistScheduleData } from "@/lib/api/staff";

// Mondays and Wednesdays, 9 to 12, half-hour slots: six a day.
const schedule: DentistScheduleData = {
  days: [1, 3].map((dayOfWeek) => ({
    dayOfWeek, start: "09:00", end: "12:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
  })),
  unavailable: [{ id: "u1", date: "2027-03-17", reason: "Leave", remarks: null }],
};
const monday = new Date(2027, 2, 15);
const veneersLimit = [{ service: "Veneers", dailyLimit: 3 }];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-03-01T00:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("how a day reads on the booking calendar", () => {
  it("counts the dentist's free times when nothing limits the visit", () => {
    expect(dayAvailability({ date: monday, schedule, bookings: undefined, limits: [], services: ["Oral"] }))
      .toEqual({ state: "open", left: 6, limitedBy: null });
  });

  it("is limited by the procedure's daily limit, less what's already booked", () => {
    const bookings = { slots: [{ time: "09:00", endTime: null }], services: { Veneers: 1 } };
    expect(dayAvailability({ date: monday, schedule, bookings, limits: veneersLimit, services: ["Veneers"] }))
      .toEqual({ state: "few", left: 2, limitedBy: "Veneers" });
  });

  it("is full once the procedure's limit is reached, even with free times left", () => {
    const bookings = { slots: [], services: { Veneers: 3 } };
    expect(dayAvailability({ date: monday, schedule, bookings, limits: veneersLimit, services: ["Oral", "Veneers"] }).state).toBe("full");
    // The same day still has room for something the dentist doesn't limit.
    expect(dayAvailability({ date: monday, schedule, bookings, limits: veneersLimit, services: ["Oral"] }).state).toBe("open");
  });

  it("is full when no free time is left for a visit that long", () => {
    const bookings = { slots: [{ time: "09:00", endTime: "11:30" }], services: {} };
    expect(dayAvailability({ date: monday, schedule, bookings, limits: [], services: ["Oral"], visitMinutes: 60 }).state).toBe("full");
  });

  it("reads days off, leave and past days as such", () => {
    expect(dayAvailability({ date: new Date(2027, 2, 16), schedule, bookings: undefined, limits: [], services: [] }).state).toBe("off");
    expect(dayAvailability({ date: new Date(2027, 2, 17), schedule, bookings: undefined, limits: [], services: [] }).state).toBe("off");
    expect(dayAvailability({ date: new Date(2027, 1, 22), schedule, bookings: undefined, limits: [], services: [] }).state).toBe("past");
    expect(dayAvailability({ date: monday, schedule: null, bookings: undefined, limits: [], services: [] }).state).toBe("off");
  });
});

describe("a different number on each day", () => {
  const withDayLimits = (dayLimits: Record<string, number>): DentistScheduleData => ({
    ...schedule, serviceHours: [{ service: "Veneers", days: [1, 3], start: null, end: null, dayLimits }],
  });
  const wednesday = new Date(2027, 2, 10);

  it("uses that day's number", () => {
    const s = withDayLimits({ "1": 1, "3": 4 });
    const bookings = { slots: [], services: { Veneers: 1 } };
    expect(dayAvailability({ date: monday, schedule: s, bookings, limits: [], services: ["Veneers"] }).state).toBe("full");
    expect(dayAvailability({ date: wednesday, schedule: s, bookings, limits: [], services: ["Veneers"] }))
      .toEqual({ state: "open", left: 3, limitedBy: "Veneers" });
  });

  it("goes before a same-every-day limit", () => {
    const s = withDayLimits({ "1": 5 });
    expect(dayAvailability({ date: monday, schedule: s, bookings: undefined, limits: veneersLimit, services: ["Veneers"] }).left).toBe(5);
    expect(dayAvailability({ date: wednesday, schedule: s, bookings: undefined, limits: veneersLimit, services: ["Veneers"] }).left).toBe(3);
  });
});
