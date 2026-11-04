import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DentistsToday } from "@/components/TodayCards";
import type { Appointment } from "@/lib/api/appointments";
import type { DentistScheduleData } from "@/lib/api/staff";

// Monday 15 March 2027; the dentist works 9 to 10, half-hour visits: two a day.
const schedule: DentistScheduleData = {
  days: [{ dayOfWeek: 1, start: "09:00", end: "10:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20 }],
  unavailable: [],
};
const visit = (time: string) => ({
  id: time, patientId: "p1", patientName: "Ana Reyes", dentistId: "d1", dentistName: "Dr. Cruz", service: "Oral Prophylaxis",
  date: "2027-03-15", time, endTime: null, status: "confirmed", type: "online", createdAt: "2027-03-01T00:00:00Z",
}) as unknown as Appointment;
const show = (appointments: Appointment[]) => render(
  <MemoryRouter><DentistsToday dentists={[{ id: "d1", name: "Dr. Cruz" }]} schedules={{ d1: schedule }} appointments={appointments} /></MemoryRouter>,
);

beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

describe("Dentists Available Today", () => {
  it("says Fully booked when every time left is taken", () => {
    vi.setSystemTime(new Date("2027-03-15T00:30:00Z")); // 8:30 AM in Manila
    show([visit("09:00"), visit("09:30")]);
    expect(screen.getByText("Fully booked")).toBeInTheDocument();
  });

  it("says Closed for today once their hours are over, not Fully booked", () => {
    vi.setSystemTime(new Date("2027-03-15T04:00:00Z")); // noon in Manila
    show([visit("09:00")]);
    expect(screen.getByText("Closed for today")).toBeInTheDocument();
    expect(screen.queryByText("Fully booked")).toBeNull();
  });
});
