import { render, screen, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

const h = vi.hoisted(() => ({ appts: [] as Appointment[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "dr-mike", name: "Dr. Mike Johnson", email: "dentist@ayagdental.com", role: "dentist", verified: true } }),
  api: vi.fn(async () => ({ appointments: h.appts })),
}));
vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistSchedule: vi.fn(async () => ({ days: [] })) };
});

import DentistAppointments from "@/pages/dentist/DentistAppointments";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

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
