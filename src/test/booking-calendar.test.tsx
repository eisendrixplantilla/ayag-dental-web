import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { DentistScheduleData } from "@/lib/api/staff";

vi.mock("@/lib/api/booking", () => ({
  getServiceLimits: vi.fn(async () => []),
  getMonthAvailability: vi.fn(async () => ({})),
}));
vi.mock("@/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => {} }));

import BookingCalendar from "@/components/BookingCalendar";

// Mondays and Wednesdays; away on two Wednesdays in March 2027, once with a reason.
const schedule: DentistScheduleData = {
  days: [1, 3].map((dayOfWeek) => ({
    dayOfWeek, start: "09:00", end: "12:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
  })),
  unavailable: [
    { id: "u1", date: "2027-03-17", reason: "Leave", remarks: null },
    { id: "u2", date: "2027-03-24", reason: null, remarks: null },
  ],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2027-03-01T02:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a date the dentist is on leave", () => {
  it("reads as a day off: just the date, and it can't be picked", async () => {
    render(<BookingCalendar schedule={schedule} dentistId="dr-1" services={["Oral"]} selected={new Date(2027, 2, 1)} onSelect={() => {}} />);
    // Wednesdays are working days; the 17th and 24th are leave, the 10th is open.
    await waitFor(() => expect(screen.getByText("10").closest("button")!.textContent).toMatch(/left/));
    for (const day of ["17", "24"]) {
      const button = screen.getByText(day).closest("button")!;
      expect(button.textContent).toBe(day);
      expect(button).toBeDisabled();
    }
    expect(screen.queryByText(/Unavail/)).toBeNull();
    expect(screen.queryByText("Dentist unavailable")).toBeNull();
    expect(screen.getByText("Day off")).toBeInTheDocument();
  });
});

describe("moving an appointment", () => {
  it("marks the day it's on now as Current, and won't take it", async () => {
    render(<BookingCalendar schedule={schedule} dentistId="dr-1" services={["Oral"]} currentDate="2027-03-08" onSelect={() => {}} />);
    await waitFor(() => expect(screen.getByText("Current")).toBeInTheDocument());
    const current = screen.getByText("Current").closest("button")!;
    expect(current.textContent).toBe("8Current");
    expect(current).toBeDisabled();
    expect(screen.getByText("Current day")).toBeInTheDocument(); // in the legend
    // The other working days still take it.
    expect(screen.getByText("10").closest("button")).not.toBeDisabled();
  });
});
