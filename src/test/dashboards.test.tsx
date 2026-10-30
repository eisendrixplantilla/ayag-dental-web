import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import { manilaTodayDateStr } from "@/lib/formatDate";

// The staff dashboards share one layout: four numbers for the period, the appointments
// by week, month or year, top treatments, the next patient, the requests waiting, today's
// appointments, the success rate and the patient totals. The network is replaced.
const h = vi.hoisted(() => ({ role: "admin", appts: [] as Appointment[], calls: [] as { path: string; body?: string }[], leave: [] as unknown[], records: [] as unknown[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Dr. Mike Johnson", email: "x@y.z", role: h.role, verified: true } }),
  api: vi.fn(async (path: string, opts?: { method?: string; body?: string }) => {
    h.calls.push({ path, body: opts?.body });
    if (path.startsWith("/patients")) {
      return { patients: [{ id: "p1", code: "PT-26100001", name: "Allen", gender: "male", age: 30, createdAt: `${manilaTodayDateStr()}T02:00:00Z` }] };
    }
    if (path.startsWith("/staff?schedule=true&dentistId")) {
      return { days: [{ dayOfWeek: new Date().getDay(), start: "00:00", end: "23:59", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 30 }], unavailable: [] };
    }
    if (path.startsWith("/staff?schedule")) {
      return { schedules: { d1: { days: [{ dayOfWeek: new Date().getDay(), start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 10 }], unavailable: [] } } };
    }
    if (path.startsWith("/staff?leave")) return { leave: h.leave };
    if (path.startsWith("/staff?directory")) return { dentists: [{ id: "d1", name: "Dr. Mike Johnson" }] };
    if (path.startsWith("/dental-records")) return { records: h.records };
    if (path.startsWith("/staff")) {
      return { staff: [
        { id: "d1", name: "Dr. Mike Johnson", role: "dentist", status: "active" },
        { id: "a1", name: "Front Desk", role: "admin", status: "active" },
      ] };
    }
    if (opts?.method === "PATCH") return { appointment: h.appts[0], emailSent: null };
    return { appointments: h.appts };
  }),
}));
vi.mock("@/components/ui/dropdown-menu", () => import("./plainDropdown"));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));

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
/** The plain stand-in menu is always open; the trigger is still clicked, as a person would. */
const openMenu = (trigger: HTMLElement) => fireEvent.click(trigger);
/** The card a title heads (a legend can repeat a title's word, so the card's own text is looked for first). */
const card = (title: string) =>
  screen.getAllByText(title).map((el) => el.closest(".shadow-card") as HTMLElement)
    .find((c) => c && !c.querySelector('[aria-label="Legend"]')?.textContent?.includes(title)) as HTMLElement;

describe("staff dashboards", () => {
  it("admin: the four numbers, the cards, and an approval straight from the dashboard", async () => {
    h.role = "admin";
    h.calls = [];
    h.appts = [
      apt(1, { status: "completed", date: `${today.slice(0, 7)}-01`, service: "Cleaning" }),
      apt(2),
      apt(3, { status: "pending", date: "2099-01-05", patientName: "Maria", service: "Root Canal" }),
    ];
    show(<AdminDashboard />);
    await screen.findByText("Top Treatments");
    for (const t of ["Total Patients", "Consultations", "Appointments", "Pending Requests"]) {
      expect(within(card(t)).getByRole("link", { name: "View report" })).toHaveAttribute("href", "/admin/reports");
    }
    expect(within(card("Consultations")).getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Monthly" })).toHaveAttribute("aria-checked", "true");
    // The front desk's own cards: who can take a walk-in, and today's list.
    expect(screen.queryByText("Next Patient Details")).toBeNull();
    const dentists = within(card("Dentists Available Today"));
    expect(dentists.getByText("Dr. Mike Johnson")).toBeInTheDocument();
    expect(dentists.getByText(/12:00 AM – 11:59 PM · 1 booked/)).toBeInTheDocument();
    const checkIn = within(card("Today's Check-in List"));
    expect(checkIn.getAllByRole("listitem")).toHaveLength(1);
    expect(checkIn.getByText("0 of 1 done")).toBeInTheDocument();
    expect(within(card("New Patients This Month")).getByRole("link", { name: "View More" })).toHaveAttribute("href", "/admin/patients");

    const requests = within(card("Approval Requests"));
    expect(requests.getByText("Maria")).toBeInTheDocument();
    openMenu(requests.getByRole("button", { name: "Options for Maria" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Approve/ }));
    await waitFor(() => expect(h.calls.some((c) => c.body?.includes('"confirmed"'))).toBe(true));
  });

  it("admin: the newest request is on top, whichever day it is for", async () => {
    h.role = "admin";
    h.appts = [
      apt(4, { status: "pending", date: "2099-01-05", patientName: "Older ask", createdAt: "2026-10-01T00:00:00Z" }),
      apt(5, { status: "pending", date: "2099-03-01", patientName: "Newest ask", createdAt: "2026-10-28T00:00:00Z" }),
    ];
    show(<AdminDashboard />);
    await screen.findByText("Newest ask");
    const names = within(card("Approval Requests")).getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);
    expect(names).toEqual(["Newest ask", "Older ask"]);
  });

  it("admin: rejecting asks for a reason first", async () => {
    h.role = "admin";
    h.calls = [];
    h.appts = [apt(3, { status: "pending", date: "2099-01-05", patientName: "Maria" })];
    show(<AdminDashboard />);
    openMenu(await screen.findByRole("button", { name: "Options for Maria" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Reject/ }));
    const send = screen.getByRole("button", { name: "Reject & Notify" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Dentist unavailable" } });
    fireEvent.click(send);
    await waitFor(() => expect(h.calls.some((c) => c.body?.includes("Dentist unavailable"))).toBe(true));
  });

  it("dentist: only their own appointments, and their own patient totals", async () => {
    h.role = "dentist";
    h.records = [];
    h.appts = [apt(1), apt(2, { dentistName: "Someone Else", patientId: "p2" })];
    show(<DentistDashboard />);
    await screen.findByText("My Schedule Today");
    expect(screen.queryByText("Approval Requests")).toBeNull();
    expect(within(card("Next Patient Details")).getByText("PT-26100001")).toBeInTheDocument();
    expect(within(card("My Schedule Today")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(card("Appointments")).getByText("1")).toBeInTheDocument();
    expect(within(card("Appointments")).getByRole("link", { name: "View all" })).toHaveAttribute("href", "/dentist/appointments");
    // One patient of theirs, first seen this month, with an account.
    const totals = within(card("Your New Patients This Month"));
    expect(totals.getAllByText("1")).toHaveLength(2);
    expect(totals.getByText("1 with an account")).toBeInTheDocument();
    expect(totals.getByText("0 walk-in guests")).toBeInTheDocument();
  });

  it("dentist: records to write and follow-ups due", async () => {
    h.role = "dentist";
    h.appts = [
      apt(1, { status: "completed", date: "2026-09-10", patientName: "Allen" }),
      apt(2, { status: "completed", date: "2026-09-12", patientName: "Bea", patientId: "p2" }),
    ];
    // Bea's consultation has its record, with a next visit already past and not booked.
    h.records = [{
      id: "r1", appointmentId: apt(2).id, patientId: "p2", patientName: "Bea", dentistId: "u1", dentistName: "Dr. Mike Johnson",
      date: "2026-09-12", diagnosis: "Caries", toothNumber: null, treatmentNotes: null, nextVisit: "2026-10-01",
      createdAt: "2026-09-12T00:00:00Z", treatments: [], prescriptions: [],
    }];
    show(<DentistDashboard />);
    const records = within(await screen.findByText("Records to Write").then((el) => el.closest(".shadow-card") as HTMLElement));
    expect(records.getAllByRole("listitem")).toHaveLength(1);
    expect(records.getByRole("link", { name: "Write Allen's record" })).toHaveAttribute("href", "/dentist/records");
    const due = within(card("Follow-ups Due"));
    expect(due.getByText("Bea")).toBeInTheDocument();
    expect(due.getByText(/Overdue \d+d/)).toBeInTheDocument();
  });

  it("superadmin: staff cards in place of the patient ones", async () => {
    h.role = "superadmin";
    h.appts = [apt(1), apt(2, { status: "completed", date: `${today.slice(0, 7)}-01` })];
    h.leave = [{
      id: "lv1", dentistId: "d1", dentistName: "Dr. Mike Johnson", role: "dentist", startDate: "2099-01-05", endDate: "2099-01-06",
      startTime: null, endTime: null, reason: "Vacation", note: null, status: "pending", decidedBy: null, decidedAt: null,
      decisionReason: null, removedDates: [], changedBy: null, changedAt: null, changeRequest: null, createdAt: "", updatedAt: "", conflicts: [],
    }];
    show(<SuperAdminDashboard />);
    await screen.findByText("Success Stats");
    expect(within(card("Total Patients")).getByRole("link", { name: "View report" })).toHaveAttribute("href", "/superadmin/reports");
    expect(screen.queryByText("Next Patient Details")).toBeNull();
    expect(screen.queryByText("Approval Requests")).toBeNull();
    expect(screen.queryByText("Today's Appointments")).toBeNull();

    const duty = within(card("Staff on Duty Today"));
    expect(duty.getByText("Dentist · 9:00 AM – 5:00 PM")).toBeInTheDocument();
    expect(duty.getByText("1 appt")).toBeInTheDocument();
    expect(duty.getByText("Admin · Off")).toBeInTheDocument();

    const leave = within(card("Leave Requests"));
    expect(leave.getByText(/Jan 5 – Jan 6 · Vacation/)).toBeInTheDocument();
    expect(leave.getByRole("button", { name: /Approve Dr. Mike Johnson's leave/ })).toBeInTheDocument();

    expect(card("Appointments by Dentist")).toBeTruthy();
  });
});

describe("patient dashboard", () => {
  it("has no graphs: the next visits and reminders", async () => {
    h.role = "patient";
    h.appts = [apt(1, { date: "2099-01-05", service: "Cleaning" })];
    show(<PatientDashboard />);
    await screen.findByText("Reminders");
    expect(screen.queryByText("Top Treatments")).toBeNull();
    expect(within(card("Next Visits")).getByText("Cleaning")).toBeInTheDocument();
  });
});
