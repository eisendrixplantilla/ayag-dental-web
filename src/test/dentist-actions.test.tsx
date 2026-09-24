import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
  // No working days unless a test gives the dentist some.
  schedule: { days: [] as any[], unavailable: [] as any[] },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "dr-mike", name: "Dr. Mike Johnson", email: "dentist@ayagdental.com", role: "dentist", verified: true } }),
  api: vi.fn(async () => ({ appointments: h.appts })),
}));
vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistSchedule: vi.fn(async () => h.schedule) };
});

// The calendar can't be driven in jsdom; a button that picks one day can.
vi.mock("@/components/ui/calendar", async () => {
  const React = await import("react");
  return {
    Calendar: ({ onSelect }: any) =>
      React.createElement("button", { onClick: () => onSelect(new Date(2027, 2, 10)) }, "Pick Mar 10"),
  };
});

import DentistAppointments from "@/pages/dentist/DentistAppointments";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);
beforeEach(() => { h.schedule = { days: [], unavailable: [] }; });

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "x", patientId: "p1", patientName: "Someone", contact: null, email: null,
    dentistId: "dr-mike", dentistName: "Dr. Mike Johnson", service: "Oral",
    date: "2026-09-25", time: "13:00", endTime: null, type: "online", status: "pending",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  };
}

describe("dentist actions wait for admin approval", () => {
  it("hides Start Consultation / Reschedule / Cancel on pending requests and says why", async () => {
    h.appts = [
      apt({ id: "p", patientName: "Allen Estrella", status: "pending" }),
      apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed", time: "14:00" }),
      apt({ id: "r", patientName: "Maria Santos", status: "rescheduled", time: "15:00" }),
    ];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);

    const pending = within((await screen.findByText("Allen Estrella")).closest("tr")!);
    for (const label of [/Start Consultation/, /Reschedule/, /^Cancel$/, /More options/]) {
      expect(pending.queryByRole("button", { name: label })).toBeNull();
    }
    expect(pending.getAllByText("Awaiting admin approval").length).toBeGreaterThan(0);

    for (const name of ["Juan Dela Cruz", "Maria Santos"]) {
      const approved = within(screen.getByText(name).closest("tr")!);
      expect(approved.getByRole("button", { name: /Start Consultation/ })).toBeInTheDocument();
      expect(approved.getByRole("button", { name: /Reschedule/ })).toBeInTheDocument();
      expect(approved.queryByText("Awaiting admin approval")).toBeNull();
    }
  });
});

describe("what the reschedule dialog tells you about the move", () => {
  const FULL_WEEK = {
    days: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
    })),
    unavailable: [],
  };
  // An open dialog hides the rest of the page from queries, so scope to it.
  const dialog = () => within(document.querySelector("[role=dialog]") as HTMLElement);

  const openResched = async () => {
    h.schedule = FULL_WEEK;
    h.appts = [apt({
      id: "c", patientName: "Juan Dela Cruz", service: "Root Canal", status: "confirmed",
      date: "2026-09-30", time: "14:00", endTime: "14:45",
    })];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    fireEvent.click(row.getByRole("button", { name: /Reschedule/ }));
    await waitFor(() => expect(document.querySelector("[role=dialog]")).not.toBeNull());
  };

  it("says which days it will even offer before the calendar greys the rest out", async () => {
    await openResched();
    const label = dialog().getByText("Your working hours:");
    expect(label.className).toMatch(/font-semibold/);
    expect(label.parentElement!.textContent).toMatch(/Sun 9:00 AM–5:00 PM/);
  });

  it("says which day the times belong to, and how many are left", async () => {
    await openResched();
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));

    const heading = await dialog().findByText(/^Times on /);
    expect(heading.textContent).toBe("Times on Wed, Mar 10 *");
    expect(heading.className).toMatch(/font-semibold/);
    expect(heading.className).toMatch(/text-foreground/);

    const count = dialog().getByText(/free$/);
    expect(count.className).toMatch(/bg-success/);
  });

  it("reads the move back before Save — where it is going, and where from", async () => {
    await openResched();
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    const slots = () => within(dialog().getByRole("group", { name: "Available time slots" }));
    await waitFor(() => expect(slots().getAllByRole("button").length).toBeGreaterThan(0));
    fireEvent.click(slots().getByRole("button", { name: "9:00 AM" }));

    const readback = (await dialog().findByText("March 10th, 2027")).closest("p")!;
    expect(readback.textContent).toBe(
      "Moving Juan Dela Cruz's Root Canal from September 30th, 2026 at 2:00 PM – 2:45 PM to March 10th, 2027 at 9:00 AM.",
    );
    expect(readback.className).toContain("bg-primary/5");
    // Where it is going carries more weight than where it came from.
    expect(within(readback).getByText("March 10th, 2027").className).toMatch(/font-semibold/);
    expect(within(readback).getByText("September 30th, 2026").className).not.toMatch(/font-semibold/);
  });

  it("says nothing about a move until a day and a time are both chosen", async () => {
    await openResched();
    expect(dialog().queryByText(/^Moving /)).toBeNull();

    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    await dialog().findByText(/^Times on /);
    expect(dialog().queryByText(/^Moving /)).toBeNull(); // the day alone isn't a move
  });
});
