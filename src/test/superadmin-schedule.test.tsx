import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { DentistScheduleData, StaffMember } from "@/lib/api/staff";
import type { LeaveRequest } from "@/lib/api/leave";

const h = vi.hoisted(() => ({
  staff: [] as StaffMember[],
  schedules: {} as Record<string, DentistScheduleData>,
  leave: [] as LeaveRequest[],
  removed: [] as [string, string[]][],
  approved: [] as string[],
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "s1", name: "Super", role: "superadmin" } }), api: vi.fn() }));
vi.mock("@/lib/api/staff", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/staff")>()),
  getStaff: vi.fn(async () => h.staff),
  getAllSchedules: vi.fn(async () => h.schedules),
}));
vi.mock("@/lib/api/leave", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/leave")>()),
  getLeave: vi.fn(async () => h.leave),
  approveLeave: vi.fn(async (id: string) => { h.approved.push(id); return h.leave[0]; }),
  removeLeaveDays: vi.fn(async (id: string, dates: string[]) => {
    h.removed.push([id, dates]);
    return { ...h.leave.find((l) => l.id === id)!, removedDates: dates };
  }),
}));
vi.mock("@/hooks/usePrintDocument", () => ({ usePrintDocument: () => vi.fn() }));

import SuperAdminSchedule from "@/pages/superadmin/SuperAdminSchedule";

const member = (id: string, name: string, role: StaffMember["role"]): StaffMember => ({
  id, employeeId: null, name, email: `${id}@x.com`, contact: null, role, status: "active", photoUrl: null, createdAt: null,
});
const day = (dayOfWeek: number, start = "09:00", end = "17:00") =>
  ({ dayOfWeek, start, end, lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20 });

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  // Monday, Oct 26 2026: the week shown is Sun Oct 25 – Sat Oct 31.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-26T02:00:00Z"));
  h.staff = [member("dr-1", "Aerhol Gocalin", "dentist"), member("ad-1", "Sarah Chen", "admin"), member("su-1", "Super", "superadmin")];
  h.schedules = {
    "dr-1": { days: [day(1), day(3), day(5)], unavailable: [{ id: "u1", date: "2026-10-30", reason: "Seminar", remarks: null }] },
    "ad-1": { days: [1, 2, 3, 4, 5].map((d) => day(d, "08:00", "17:00")), unavailable: [] },
  };
  h.leave = [];
  h.removed = [];
  h.approved = [];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const renderPage = () => render(
  <MemoryRouter initialEntries={["/superadmin/schedule"]}>
    <Routes>
      <Route path="/superadmin/schedule" element={<SuperAdminSchedule />} />
      <Route path="/superadmin/staff/:id/schedule" element={<p>Editing schedule</p>} />
    </Routes>
  </MemoryRouter>,
);
/** A person's row, as Sun–Sat text. */
const week = (name: string) =>
  within(screen.getByRole("button", { name }).closest("tr")!).getAllByRole("cell").slice(1).map((c) => c.textContent);

describe("the team's week", () => {
  it("shows each dentist's and admin's hours, days off and leave", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Aerhol Gocalin" });
    expect(week("Aerhol Gocalin")).toEqual([
      "Off", "9:00 AM– 5:00 PM", "Off", "9:00 AM– 5:00 PM", "Off", "On leave", "Off",
    ]);
    expect(week("Sarah Chen")).toEqual([
      "Off", ...Array(5).fill("8:00 AM– 5:00 PM"), "Off",
    ]);
    expect(screen.queryByRole("button", { name: "Super" })).toBeNull(); // the superadmin has no schedule
  });

  it("filters by role", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Aerhol Gocalin" });
    fireEvent.click(screen.getByRole("radio", { name: "Admins" }));
    expect(screen.queryByRole("button", { name: "Aerhol Gocalin" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sarah Chen" })).toBeInTheDocument();
  });

  it("moves a week at a time", async () => {
    renderPage();
    await screen.findByText("Oct 25 – Oct 31, 2026");
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Nov 1 – Nov 7, 2026")).toBeInTheDocument();
    // Friday the 30th's leave is last week's now.
    expect(week("Aerhol Gocalin")[5]).toBe("9:00 AM– 5:00 PM");
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByText("Oct 25 – Oct 31, 2026")).toBeInTheDocument();
  });

  it("opens a person's schedule from their name", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Sarah Chen" }));
    expect(await screen.findByText("Editing schedule")).toBeInTheDocument();
  });
});

describe("leave waiting for approval", () => {
  it("is listed on top, approved right there", async () => {
    h.leave = [{
      id: "l1", dentistId: "ad-1", dentistName: "Sarah Chen", role: "admin", startDate: "2026-11-03", endDate: "2026-11-04",
      reason: "Personal", note: null, status: "pending", decidedBy: null, decidedAt: null, decisionReason: null, removedDates: [], changedBy: null, changedAt: null, startTime: null, endTime: null,
      createdAt: "2026-10-26T01:00:00Z", updatedAt: "2026-10-26T01:00:00Z", conflicts: [],
    }];
    renderPage();
    expect(await screen.findByText("Leave Waiting for Approval")).toBeInTheDocument();
    expect(screen.getByText("Nov 3 – Nov 4 · Personal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve Sarah Chen's leave for Nov 3 – Nov 4" }));
    await waitFor(() => expect(h.approved).toEqual(["l1"]));
  });

  it("isn't there when nothing is waiting", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Aerhol Gocalin" });
    expect(screen.queryByText("Leave Waiting for Approval")).toBeNull();
  });
});

describe("all leave", () => {
  const req = (over: Partial<LeaveRequest>): LeaveRequest => ({
    id: "l1", dentistId: "dr-1", dentistName: "Aerhol Gocalin", role: "dentist", startDate: "2026-11-03", endDate: "2026-11-04",
    reason: "Vacation", note: null, status: "approved", decidedBy: "Super Admin", decidedAt: null, decisionReason: null, removedDates: [], changedBy: null, changedAt: null, startTime: null, endTime: null,
    createdAt: "2026-10-20T01:00:00Z", updatedAt: "2026-10-20T01:00:00Z", conflicts: [], ...over,
  });

  it("lists every request, newest first, for the role on show", async () => {
    h.leave = [
      req({ id: "old" }),
      req({ id: "new", dentistId: "ad-1", dentistName: "Sarah Chen", role: "admin", status: "rejected", decidedBy: "Super Admin",
        decisionReason: "Clinic event", createdAt: "2026-10-25T01:00:00Z", startDate: "2026-12-01", endDate: "2026-12-01", reason: "Personal" }),
    ];
    renderPage();
    const table = within((await screen.findByText("All Leave")).closest(".shadow-card") as HTMLElement);
    const rows = () => table.getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    await waitFor(() => expect(rows()).toEqual([
      ["Sarah ChenAdmin", "Dec 1", "Personal", "Oct 25, 20269:00 AM", "rejected", "Super Admin", ""],
      ["Aerhol GocalinDentist", "Nov 3 – Nov 4", "Vacation", "Oct 20, 20269:00 AM", "approved", "Super Admin", ""],
    ]));

    fireEvent.click(screen.getByRole("radio", { name: "Dentists" }));
    expect(rows()).toEqual([["Aerhol GocalinDentist", "Nov 3 – Nov 4", "Vacation", "Oct 20, 20269:00 AM", "approved", "Super Admin", ""]]);
  });

  it("takes the days ticked off approved leave, past days staying", async () => {
    h.leave = [req({ startDate: "2026-10-25", endDate: "2026-10-28", removedDates: ["2026-10-28"] })];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove days from Aerhol Gocalin's leave" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("checkbox", { name: "Sun, Oct 25, 2026" })).toBeDisabled(); // already taken
    expect(dialog.getByRole("checkbox", { name: "Wed, Oct 28, 2026" })).toBeDisabled(); // removed before
    expect(dialog.getByText("Already taken")).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("checkbox", { name: "Tue, Oct 27, 2026" }));
    fireEvent.click(dialog.getByRole("button", { name: "Remove 1 day" }));
    await waitFor(() => expect(h.removed).toEqual([["l1", ["2026-10-27"]]]));
  });

  it("calls the whole leave off when every day left is ticked", async () => {
    h.leave = [req({})];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Remove days from Aerhol Gocalin's leave" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Select all" }));
    expect(dialog.getByText(/whole leave will be cancelled/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Cancel leave" }));
    await waitFor(() => expect(h.removed).toEqual([["l1", ["2026-11-03", "2026-11-04"]]]));
  });

  it("notes the days removed, and offers nothing on leave that's over", async () => {
    h.leave = [
      req({ removedDates: ["2026-11-04"] }),
      req({ id: "l2", startDate: "2026-10-01", endDate: "2026-10-02", createdAt: "2026-09-20T01:00:00Z" }),
    ];
    renderPage();
    expect(await screen.findByText("1 day removed")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Remove days from/ })).toHaveLength(1);
  });

  it("shows everything about one leave", async () => {
    h.leave = [req({ note: "Family trip", decidedAt: "2026-10-21T02:00:00Z", removedDates: ["2026-11-04"], changedBy: "Super Admin", changedAt: "2026-10-22T02:00:00Z" })];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "View Aerhol Gocalin's leave" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Family trip")).toBeInTheDocument();
    expect(dialog.getByText("Approved by")).toBeInTheDocument();
    expect(dialog.getByText("Days removed by")).toBeInTheDocument();
    const days = within(dialog.getByRole("list", { name: "Days of this leave" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(days).toEqual(["Tue, Nov 3, 2026On leave", "Wed, Nov 4, 2026Removed"]);
  });

  it("offers the form to add leave for a dentist or admin", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /Add Leave/ })).toBeInTheDocument();
  });
});
