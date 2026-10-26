import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DentistScheduleData } from "@/lib/api/staff";

// A dentist can take their own schedule off the printer as the clinic's standard
// document — the week a day at a time, then the leave approved against it.
const h = vi.hoisted(() => ({ schedule: null as DentistScheduleData | null, leave: [] as import("@/lib/api/leave").LeaveRequest[] }));
const printed = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "d1", name: "Dr. Mike Johnson", email: "dentist@ayagdental.com", role: "dentist", verified: true },
  }),
  api: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistSchedule: vi.fn(async () => h.schedule) };
});
vi.mock("@/lib/api/leave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/leave")>();
  return { ...actual, getLeave: vi.fn(async () => h.leave) };
});
vi.mock("@/lib/printReport", () => ({
  printReport: (doc: any) => { printed.calls.push(doc); return true; },
  ROWS_PER_PAGE: 18,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import DentistSchedule from "@/pages/dentist/DentistSchedule";

afterEach(cleanup);

beforeEach(() => {
  printed.calls = [];
  h.leave = [];
  h.schedule = {
    days: [
      { dayOfWeek: 3, start: "09:00", end: "17:00", lunchStart: "12:00", lunchEnd: "13:00", duration: 30, maxPatients: 10 },
      { dayOfWeek: 1, start: "08:00", end: "16:00", lunchStart: null, lunchEnd: null, duration: 60, maxPatients: 8 },
    ],
    unavailable: [
      { id: "u1", date: "2026-10-05", reason: "Seminar", remarks: null },
      { id: "u2", date: "2026-12-24", reason: null, remarks: null },
    ],
  };
});

const clickPrint = async () => fireEvent.click(await screen.findByRole("button", { name: /Print/ }));
const doc = () => printed.calls[0];

describe("a dentist prints their own schedule", () => {
  beforeEach(() => {
    // Monday, Oct 26 2026: the week on show is Sun Oct 25 – Sat Oct 31.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("prints the week on show, with its leave, then the Leave table as it stands", async () => {
    h.schedule!.unavailable.push(
      { id: "u3", date: "2026-10-28", reason: "Vacation", remarks: null },
      { id: "u4", date: "2026-10-26", reason: "Personal", remarks: null, startTime: "13:00", endTime: "15:00" },
    );
    h.leave = [{
      id: "l1", dentistId: "d1", dentistName: "Dr. Mike Johnson", role: "dentist", startDate: "2026-10-28", endDate: "2026-10-28",
      startTime: null, endTime: null, reason: "Vacation", note: null, status: "approved", decidedBy: "Super Admin", decidedAt: null,
      decisionReason: null, removedDates: [], changedBy: null, changedAt: null, createdAt: "2026-10-20T01:00:00Z", updatedAt: "2026-10-20T01:00:00Z", conflicts: [],
    }];
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));

    expect(doc().title).toBe("Clinic Schedule");
    expect(doc().tables.map((t: any) => t.heading)).toEqual(["Weekly Schedule", "Leave"]);
    expect(doc().filters).toContainEqual({ label: "Week", value: "Oct 25 – Oct 31, 2026" });
    expect(doc().filters).toContainEqual({ label: "Working Days", value: "Monday, Wednesday" });

    expect(doc().tables[0].columns).toEqual(["Day", "Date", "Working Hours", "Lunch Break", "Leave"]);
    expect(doc().tables[0].rows).toEqual([
      ["Sunday", "Oct 25, 2026", "Off", "—", "—"],
      ["Monday", "Oct 26, 2026", "8:00 AM - 4:00 PM (60 min)", "None", "Leave 1:00 PM – 3:00 PM · Personal"],
      ["Tuesday", "Oct 27, 2026", "Off", "—", "—"],
      ["Wednesday", "Oct 28, 2026", "—", "—", "On leave · Vacation"],
      ["Thursday", "Oct 29, 2026", "Off", "—", "—"],
      ["Friday", "Oct 30, 2026", "Off", "—", "—"],
      ["Saturday", "Oct 31, 2026", "Off", "—", "—"],
    ]);

    // The request, then the days off the clinic set that no leave covers.
    expect(doc().tables[1].rows).toEqual([
      ["Oct 28", "1 day", "Vacation", "Oct 20, 2026, 9:00 AM", "Approved"],
      ["Dec 24", "Whole day", "—", "Set by the clinic", "Day off"],
      ["Oct 26", "1:00 PM – 3:00 PM", "Personal", "Set by the clinic", "Day off"],
      ["Oct 5", "Whole day", "Seminar", "Set by the clinic", "Day off"],
    ]);

    // Signed by the dentist printing it, like every other document in the system.
    expect(doc().preparedBy).toEqual({ name: "Dr. Mike Johnson", role: "Dentist" });
    expect(doc().generatedAt).toBeTruthy();
  });

  it("says so on the document when there's no leave", async () => {
    h.schedule = { ...h.schedule!, unavailable: [] };
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    expect(doc().tables[1].rows).toEqual([]);
    expect(doc().tables[1].emptyText).toBe("No leave yet.");
  });

  it("offers nothing to print when no schedule has been assigned", async () => {
    h.schedule = { days: [], unavailable: [] };
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await screen.findByText(/No schedule found for your account/);
    expect(screen.queryByRole("button", { name: /Print/ })).toBeNull();
  });
});

describe("the week on screen", () => {
  beforeEach(() => {
    // Monday, Oct 26 2026: the week shown is Sun Oct 25 – Sat Oct 31.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());
  const rows = async () => [...(await screen.findByRole("list", { name: "Weekly schedule" })).querySelectorAll("li")]
    .map((li) => li.textContent);

  it("shows the week's dates in one card: hours and lunch, Off, leave in place of the hours", async () => {
    h.schedule!.unavailable.push({ id: "u3", date: "2026-10-28", reason: "Seminar / Training", remarks: null });
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    expect(await rows()).toEqual([
      "SundayOct 25Off",
      "MondayTodayOct 268:00 AM - 4:00 PMNo lunch break",
      "TuesdayOct 27Off",
      "WednesdayOct 28On leave—Seminar / Training",
      "ThursdayOct 29Off", "FridayOct 30Off", "SaturdayOct 31Off",
    ]);
    expect(screen.getByText("2 working days · 60-minute slots")).toBeInTheDocument();
  });

  it("moves a week at a time", async () => {
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await rows();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Nov 1 – Nov 7, 2026")).toBeInTheDocument();
    expect((await rows())[3]).toBe("WednesdayNov 49:00 AM - 5:00 PM · 30 min12:00 PM - 1:00 PM");
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByText("Oct 25 – Oct 31, 2026")).toBeInTheDocument();
  });
});
