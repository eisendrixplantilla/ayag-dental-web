import { render, screen, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import { manilaTodayDateStr } from "@/lib/formatDate";

// Every dashboard is a short summary: the period's four numbers, its two graphs and, for
// the staff who run the day, a short list. The network is replaced.
const h = vi.hoisted(() => ({ role: "admin", appts: [] as Appointment[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Dr. Mike Johnson", email: "x@y.z", role: h.role, verified: true } }),
  api: vi.fn(async (path: string) => {
    if (path.startsWith("/patients")) return { patients: [{ id: "p1", name: "A", createdAt: `${manilaTodayDateStr()}T02:00:00Z` }] };
    if (path.startsWith("/staff")) return { staff: [{ id: "d1", name: "Dr. Mike Johnson", role: "dentist", status: "active" }] };
    return { appointments: h.appts };
  }),
}));

import AdminDashboard from "@/pages/admin/AdminDashboard";
import DentistDashboard from "@/pages/dentist/DentistDashboard";
import PatientDashboard from "@/pages/patient/PatientDashboard";
import SuperAdminDashboard from "@/pages/superadmin/SuperAdminDashboard";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const today = manilaTodayDateStr();
function apt(i: number, over: Partial<Appointment> = {}): Appointment {
  return {
    id: `00000000-0000-4000-8000-00000000000${i}`, patientId: "p1", patientName: `Patient ${i}`, contact: null, email: null,
    dentistId: "d1", dentistName: "Dr. Mike Johnson", service: "Oral",
    date: today, time: "23:50", endTime: null, type: "online", status: "confirmed",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  } as Appointment;
}

const show = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const card = (title: string) => screen.getByText(title).closest(".shadow-card") as HTMLElement;

describe("dashboards", () => {
  it("admin: the period's numbers, the graphs, and a short list of today", async () => {
    h.role = "admin";
    h.appts = [...Array.from({ length: 7 }, (_, i) => apt(i)), apt(8, { status: "pending", type: "walk-in" })];
    show(<AdminDashboard />);
    await screen.findByText("Appointments Over Time");
    expect(within(card("Pending Requests")).getByText("1")).toBeInTheDocument();
    expect(within(card("Walk-ins")).getByText("1")).toBeInTheDocument();
    expect(within(card("New Patients")).getByText("1")).toBeInTheDocument();
    expect(screen.getByText("By Status")).toBeInTheDocument();
    // Five of today's eight, and a link to the rest.
    expect(within(card("Still to Come Today")).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("and 3 more")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open queue/i })).toHaveAttribute("href", "/admin/queue");
    expect(screen.queryByText("Recent Appointments")).toBeNull();
  });

  it("dentist: only their own appointments", async () => {
    h.role = "dentist";
    h.appts = [apt(1), apt(2, { dentistName: "Someone Else" })];
    show(<DentistDashboard />);
    await screen.findByText("Appointments Over Time");
    expect(within(card("My Appointments")).getByText("1")).toBeInTheDocument();
    expect(within(card("Today's Schedule")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("patient: no graphs, the next visits and reminders", async () => {
    h.role = "patient";
    h.appts = [apt(1, { date: "2099-01-05", service: "Cleaning" })];
    show(<PatientDashboard />);
    await screen.findByText("Reminders");
    expect(screen.queryByText("Appointments Over Time")).toBeNull();
    expect(within(card("Next Visits")).getByText("Cleaning")).toBeInTheDocument();
  });

  it("superadmin: four numbers and two graphs, nothing more", async () => {
    h.role = "superadmin";
    h.appts = [apt(1)];
    show(<SuperAdminDashboard />);
    await screen.findByText("Appointments Over Time");
    expect(within(card("Active Dentists")).getByText("of 1 dentist")).toBeInTheDocument();
    expect(screen.queryByText("Staff")).toBeNull();
  });
});
