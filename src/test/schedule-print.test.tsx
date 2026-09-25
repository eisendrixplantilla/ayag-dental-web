import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DentistScheduleData } from "@/lib/api/staff";

// A dentist can take their own schedule off the printer as the clinic's standard
// document — the week a day at a time, then the leave approved against it.
const h = vi.hoisted(() => ({ schedule: null as DentistScheduleData | null }));
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
vi.mock("@/lib/printReport", () => ({
  printReport: (doc: any) => { printed.calls.push(doc); return true; },
  ROWS_PER_PAGE: 18,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import DentistSchedule from "@/pages/dentist/DentistSchedule";

afterEach(cleanup);

beforeEach(() => {
  printed.calls = [];
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
  it("prints the working week and the approved leave as one document", async () => {
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));

    expect(doc().title).toBe("Clinic Schedule");
    expect(doc().tables.map((t: any) => t.heading)).toEqual(["Working Hours", "Leave Schedule"]);

    // The week reads in day order, whatever order it arrived in.
    expect(doc().tables[0].columns).toEqual(["Day", "Working Hours", "Lunch Break", "Slot Duration"]);
    expect(doc().tables[0].rows).toEqual([
      ["Monday", "8:00 AM - 4:00 PM", "None", "60 min"],
      ["Wednesday", "9:00 AM - 5:00 PM", "12:00 PM - 1:00 PM", "30 min"],
    ]);
    expect(doc().filters).toContainEqual({ label: "Working Days", value: "Monday, Wednesday" });

    // Leave says which day of the week it falls on; a leave with no reason still prints.
    expect(doc().tables[1].rows).toEqual([
      ["2026-10-05", "Monday", "Seminar"],
      ["2026-12-24", "Thursday", "—"],
    ]);

    // Signed by the dentist printing it, like every other document in the system.
    expect(doc().preparedBy).toEqual({ name: "Dr. Mike Johnson", role: "Dentist" });
    expect(doc().generatedAt).toBeTruthy();
  });

  it("says so on the document when no leave has been approved", async () => {
    h.schedule = { ...h.schedule!, unavailable: [] };
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));

    expect(doc().tables[1].rows).toEqual([]);
    expect(doc().tables[1].emptyText).toBe("No approved leave at the moment.");
  });

  it("offers nothing to print when no schedule has been assigned", async () => {
    h.schedule = { days: [], unavailable: [] };
    render(<MemoryRouter><DentistSchedule /></MemoryRouter>);
    await screen.findByText(/No schedule found for your account/);
    expect(screen.queryByRole("button", { name: /Print/ })).toBeNull();
  });
});
