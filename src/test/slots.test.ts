import { describe, expect, it } from "vitest";
import { generateAvailableSlots, type DentistScheduleData } from "@/lib/api/staff";
import { formatDuration, totalServiceMinutes } from "@/lib/services";

// Far enough ahead that "already past" never applies, whatever day the tests run.
const DATE = new Date(2030, 0, 7); // a Monday
const schedule = (over: Partial<DentistScheduleData["days"][number]> = {}): DentistScheduleData => ({
  days: [{
    dayOfWeek: DATE.getDay(), start: "09:00", end: "17:00",
    lunchStart: "12:00", lunchEnd: "13:00", duration: 30, maxPatients: 20,
    ...over,
  }],
  unavailable: [],
});
const starts = (...args: Parameters<typeof generateAvailableSlots>) =>
  generateAvailableSlots(...args).map(s => s.value);

describe("time slots reflect how long the visit needs", () => {
  it("offers every free half hour for a short visit", () => {
    const free = starts(schedule(), DATE, [], 30);
    expect(free.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
    expect(free).not.toContain("12:00"); // lunch
    expect(free.at(-1)).toBe("16:30"); // last 30 minutes of the day
  });

  it("drops the start times where a longer visit wouldn't fit", () => {
    const free = starts(schedule(), DATE, [], 90);
    expect(free.at(-1)).toBe("15:30"); // 15:30–17:00 is the last that fits
    // 11:00, 11:30 and 12:00 would all run into the 12:00 lunch break.
    expect(free).not.toContain("11:00");
    expect(free).not.toContain("11:30");
    expect(free).toContain("10:30"); // 10:30–12:00 stops exactly at lunch
  });

  it("keeps a longer visit clear of what's already booked", () => {
    const booked = [{ time: "11:00", endTime: "12:00" }];
    const free = starts(schedule(), DATE, booked, 60);

    expect(free).not.toContain("11:00"); // taken outright
    expect(free).not.toContain("10:30"); // would run into it
    expect(free).toContain("10:00"); // 10:00–11:00 ends as it starts
    expect(free).toContain("13:00"); // after lunch, clear again
  });

  it("treats a booking with no end time as one of the dentist's own slots", () => {
    const free = starts(schedule(), DATE, [{ time: "09:30", endTime: null }], 30);
    expect(free).not.toContain("09:30");
    expect(free).toContain("09:00");
    expect(free).toContain("10:00");

    // A plain time works the same way, for callers that never had end times.
    expect(starts(schedule(), DATE, ["09:30"], 30)).toEqual(free);
  });

  it("never offers less than one of the dentist's slots", () => {
    // A 10-minute service still occupies the dentist's 30-minute slot.
    expect(starts(schedule(), DATE, [{ time: "09:30", endTime: null }], 10))
      .toEqual(starts(schedule(), DATE, [{ time: "09:30", endTime: null }], 30));
  });

  it("falls back to the dentist's slot length when no duration is given", () => {
    expect(starts(schedule(), DATE, [])).toEqual(starts(schedule(), DATE, [], 30));
  });
});

describe("visit length", () => {
  const durations = { Oral: 30, Veeners: 60, "Root Canal": 90 };

  it("adds up the services chosen", () => {
    expect(totalServiceMinutes(["Oral", "Veeners"], durations)).toBe(90);
    expect(totalServiceMinutes([], durations)).toBe(0);
  });

  it("assumes half an hour for a service the clinic hasn't timed", () => {
    expect(totalServiceMinutes(["Dental Cleaning"], durations)).toBe(30);
    expect(totalServiceMinutes(["Oral", "Dental Cleaning"], durations)).toBe(60);
  });

  it("reads as hours and minutes", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });
});

describe("what each option says", () => {
  it("spells out when the visit would finish", () => {
    const [first] = generateAvailableSlots(schedule(), DATE, [], 90);
    expect(first).toEqual({ value: "09:00", label: "9:00 AM – 10:30 AM" });
  });

  it("shows the start alone when no duration is given", () => {
    const [first] = generateAvailableSlots(schedule(), DATE, []);
    expect(first).toEqual({ value: "09:00", label: "9:00 AM" });
  });
});
