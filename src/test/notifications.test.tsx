import { render, screen, fireEvent, waitFor, within, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

// ---- Shared mock state (hoisted so the vi.mock factories below can see it) ----
const h = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string; role: string; verified: boolean },
  appts: [] as Appointment[],
  leave: [] as import("@/lib/api/leave").LeaveRequest[],
}));

vi.mock("@/lib/api/leave", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/leave")>();
  return { ...actual, getLeave: vi.fn(async () => h.leave) };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: h.user, logout: vi.fn() }),
  api: vi.fn(),
}));

vi.mock("@/lib/api/appointments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/appointments")>();
  return {
    ...actual,
    // Mirrors the server's filtering closely enough for these pages.
    getAppointments: vi.fn(async (f: { type?: string; dentistId?: string; date?: string } = {}) =>
      h.appts.filter(a =>
        (!f.type || a.type === f.type) &&
        (!f.dentistId || a.dentistId === f.dentistId) &&
        (!f.date || a.date === f.date))),
  };
});

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistDirectory: vi.fn(async () => []), getDentistSchedule: vi.fn(async () => ({ days: [] })) };
});

vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return { ...actual, getPatients: vi.fn(async () => []) };
});

// jsdom takes ~30s to lay out Radix's floating menu, which says nothing about the app
// (it opens instantly in a browser). Swap in a plain open/close menu so these tests
// exercise our routing and read-state logic rather than Radix positioning.
vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  type Ctx = { open: boolean; setOpen: (o: boolean) => void };
  const MenuCtx = React.createContext<Ctx>({ open: false, setOpen: () => {} });
  const DropdownMenu = ({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; children: React.ReactNode }) => {
    const [inner, setInner] = React.useState(false);
    const isOpen = open ?? inner;
    const setOpen = (o: boolean) => { onOpenChange?.(o); if (open === undefined) setInner(o); };
    return <MenuCtx.Provider value={{ open: isOpen, setOpen }}>{children}</MenuCtx.Provider>;
  };
  const DropdownMenuTrigger = ({ children }: { children: React.ReactElement }) => {
    const { open, setOpen } = React.useContext(MenuCtx);
    return React.cloneElement(children, {
      onClick: () => setOpen(!open),
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") setOpen(!open); },
    });
  };
  const DropdownMenuContent = ({ children }: { children: React.ReactNode }) =>
    React.useContext(MenuCtx).open ? <div role="menu">{children}</div> : null;
  const DropdownMenuItem = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    <div role="menuitem" onClick={onClick}>{children}</div>;
  return { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator: () => <hr />, DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

import DashboardLayout from "@/components/DashboardLayout";
import AdminAppointments from "@/pages/admin/AdminAppointments";
import AdminOnlineAppointments from "@/pages/admin/AdminOnlineAppointments";
import { NotificationsProvider, useNotifications } from "@/contexts/NotificationsContext";

// ---- jsdom gaps that Radix and the jump hook rely on ----
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "x", patientId: null, patientName: "Someone", contact: null, email: null,
    dentistId: null, dentistName: "Dr. Mike Johnson", service: "Restoration",
    date: "2026-09-24", time: "11:00", endTime: null, type: "online", status: "pending",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: null,
    createdAt: "2026-09-20T00:00:00Z", updatedAt: "2026-09-20T00:00:00Z",
    ...over,
  };
}

const ADMIN = { id: "admin-1", name: "Dr. Sarah Chen", email: "admin@admin.com", role: "admin", verified: true };

function renderAdminApp(at = "/admin") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/admin" element={<DashboardLayout><h1>Admin home</h1></DashboardLayout>} />
        <Route path="/admin/appointments" element={<DashboardLayout><AdminAppointments /></DashboardLayout>} />
        <Route path="/admin/online-appointments" element={<DashboardLayout><AdminOnlineAppointments /></DashboardLayout>} />
      </Routes>
    </MemoryRouter>,
  );
}

const bell = () => screen.getByRole("button", { name: /^Notifications/ });
const openBell = () => fireEvent.keyDown(bell(), { key: "Enter" });
/** The <li> in the sidebar that holds the link to `url`. */
const sidebarItem = (url: string) => document.querySelector(`a[href="${url}"]`)!.closest("li")!;
const sidebarCount = (url: string) => sidebarItem(url).querySelector('[data-sidebar="menu-badge"]')?.textContent ?? null;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
});
afterEach(cleanup);

describe("admin notifications", () => {
  beforeEach(() => {
    h.user = ADMIN;
    h.appts = [
      apt({ id: "walk-1", type: "walk-in", status: "confirmed", patientName: "Juan Dela Cruz", updatedAt: "2026-09-22T10:00:00Z" }),
      apt({ id: "online-1", type: "online", status: "pending", patientName: "Maria Online", updatedAt: "2026-09-22T11:00:00Z" }),
      apt({ id: "online-2", type: "online", status: "confirmed", patientName: "Pedro Reyes", updatedAt: "2026-09-22T09:00:00Z" }),
    ];
  });

  it("shows per-module unread counts in the sidebar that add up to the bell", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
    expect(sidebarCount("/admin/appointments")).toBe("1");        // the walk-in
    expect(sidebarCount("/admin/online-appointments")).toBe("2"); // the two online bookings
    expect(sidebarCount("/admin/patients")).toBeNull();            // modules with nothing new stay clean
  });

  it("jumps a walk-in notification to Walk-in Appointments and highlights that row", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));

    openBell();
    fireEvent.click(await screen.findByText(/Walk-in appointment added for Juan Dela Cruz/));

    expect(await screen.findByRole("heading", { level: 1, name: "Walk-in Appointments" })).toBeInTheDocument();
    await waitFor(() => {
      const row = screen.getAllByText("Juan Dela Cruz").map(el => el.closest("tr")).find(Boolean)!;
      expect(row.className).toContain("ring-primary/50");
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    // Marked read: bell drops by one and the walk-in module's count disappears.
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (2 unread)"));
    expect(sidebarCount("/admin/appointments")).toBeNull();
    expect(sidebarCount("/admin/online-appointments")).toBe("2");
  });

  it("jumps an online booking to Appointments, not the walk-in page", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));

    openBell();
    fireEvent.click(await screen.findByText(/New booking request from Maria Online/));

    expect(await screen.findByRole("heading", { level: 1, name: "Appointments" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Walk-in Appointments" })).toBeNull();
    await waitFor(() => {
      const row = screen.getAllByText("Maria Online").map(el => el.closest("tr")).find(Boolean)!;
      expect(row.className).toContain("ring-primary/50");
    });
    await waitFor(() => expect(sidebarCount("/admin/online-appointments")).toBe("1"));
  });

  const walkInRow = () => screen.getAllByText("Juan Dela Cruz").map(el => el.closest("tr")).find(Boolean)!;
  const clickNotification = async (text: RegExp) => {
    openBell();
    fireEvent.click(await screen.findByText(text));
  };

  it("re-clicking a notification while already on that page jumps and highlights again", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
    const scroll = vi.mocked(Element.prototype.scrollIntoView);

    await clickNotification(/Walk-in appointment added for Juan Dela Cruz/);
    await waitFor(() => expect(walkInRow().className).toContain("ring-primary/50"));
    const afterFirst = scroll.mock.calls.length;

    // Same notification again, now that it's read and we're already on the page.
    await clickNotification(/Walk-in appointment added for Juan Dela Cruz/);
    await waitFor(() => expect(scroll.mock.calls.length).toBeGreaterThan(afterFirst));
    expect(walkInRow().className).toContain("ring-primary/50");
    expect(screen.getByRole("heading", { level: 1, name: "Walk-in Appointments" })).toBeInTheDocument();
  });

  it("re-clicking the lit row restarts its highlight instead of letting it expire early", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderAdminApp();
      await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
      await clickNotification(/Walk-in appointment added for Juan Dela Cruz/);
      await waitFor(() => expect(walkInRow().className).toContain("ring-primary/50"));

      // 2.5s into the 3s flash, click it again...
      await act(() => vi.advanceTimersByTimeAsync(2500));
      await clickNotification(/Walk-in appointment added for Juan Dela Cruz/);
      // ...and 1s later it must still be lit: a fresh 3s, not the old flash's last 0.5s.
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(walkInRow().className).toContain("ring-primary/50");

      // It does still time out eventually.
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(walkInRow().className).not.toContain("ring-primary/50");
    } finally {
      vi.useRealTimers();
    }
  });

  it("jumping between two notifications on different pages lands on each in turn", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));

    await clickNotification(/Walk-in appointment added for Juan Dela Cruz/);
    await waitFor(() => expect(walkInRow().className).toContain("ring-primary/50"));

    await clickNotification(/New booking request from Maria Online/);
    expect(await screen.findByRole("heading", { level: 1, name: "Appointments" })).toBeInTheDocument();
    await waitFor(() => {
      const row = screen.getAllByText("Maria Online").map(el => el.closest("tr")).find(Boolean)!;
      expect(row.className).toContain("ring-primary/50");
    });

    await clickNotification(/Walk-in appointment added for Juan Dela Cruz/);
    expect(await screen.findByRole("heading", { level: 1, name: "Walk-in Appointments" })).toBeInTheDocument();
    await waitFor(() => expect(walkInRow().className).toContain("ring-primary/50"));
  });

  it("a notification that's already marked as read still jumps to its row", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
    openBell();
    fireEvent.click(await screen.findByRole("button", { name: /Mark all as read/ }));
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications"));

    fireEvent.click(await screen.findByText(/Walk-in appointment added for Juan Dela Cruz/));
    expect(await screen.findByRole("heading", { level: 1, name: "Walk-in Appointments" })).toBeInTheDocument();
    await waitFor(() => expect(walkInRow().className).toContain("ring-primary/50"));
    expect(bell()).toHaveAccessibleName("Notifications"); // stays read, doesn't flip back
  });

  it("clears the sidebar counts and the bell badge on Mark all as read", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
    openBell();
    fireEvent.click(await screen.findByRole("button", { name: /Mark all as read/ }));
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications"));
    expect(sidebarCount("/admin/appointments")).toBeNull();
    expect(sidebarCount("/admin/online-appointments")).toBeNull();
  });

  it("shows a dot in place of the number when the sidebar is collapsed to icons", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
    const dot = () => sidebarItem("/admin/appointments").querySelector("span.rounded-full.bg-primary.w-2");
    expect(dot()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    await waitFor(() => expect(dot()).not.toBeNull());
  });

  it("lights the count back up when an already-read appointment changes again", async () => {
    renderAdminApp();
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (3 unread)"));
    openBell();
    fireEvent.click(await screen.findByRole("button", { name: /Mark all as read/ }));
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications"));

    // Someone reschedules the walk-in; the next refresh picks it up as new.
    h.appts = h.appts.map(a => a.id === "walk-1" ? { ...a, status: "rescheduled", updatedAt: "2026-09-22T12:00:00Z" } : a);
    window.dispatchEvent(new Event("appointments:changed"));
    await waitFor(() => expect(bell()).toHaveAccessibleName("Notifications (1 unread)"));
    expect(sidebarCount("/admin/appointments")).toBe("1");
  });
});

describe("mobile sidebar", () => {
  it("closes the drawer when a module is tapped", async () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 500 });
    sessionStorage.setItem("sidebar:openMobile", "true");
    h.user = ADMIN;
    h.appts = [];
    renderAdminApp();

    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByText("Walk-in Appointment"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByRole("heading", { level: 1, name: "Walk-in Appointments" })).toBeInTheDocument();
  });
});

describe("each role is sent to its own module", () => {
  function RouteDump() {
    const { items } = useNotifications();
    return <pre data-testid="routes">{JSON.stringify(Object.fromEntries(items.map(i => [i.id, i.route])))}</pre>;
  }
  const routesFor = async (user: typeof ADMIN) => {
    h.user = user;
    render(<MemoryRouter><NotificationsProvider><RouteDump /></NotificationsProvider></MemoryRouter>);
    let parsed: Record<string, string> = {};
    await waitFor(() => {
      parsed = JSON.parse(screen.getByTestId("routes").textContent!);
      expect(Object.keys(parsed).length).toBeGreaterThan(0);
    });
    return parsed;
  };

  beforeEach(() => {
    h.appts = [
      apt({ id: "mine-confirmed", status: "confirmed", dentistName: "Dr. Mike Johnson" }),
      apt({ id: "mine-completed", status: "completed", dentistName: "Dr. Mike Johnson" }),
      apt({ id: "mine-walkin", type: "walk-in", status: "confirmed", dentistName: "Dr. Mike Johnson" }),
      apt({ id: "someone-elses", status: "pending", dentistName: "Abaristo Matthew" }),
    ];
  });

  it("dentist: appointments to My Appointments, completed consultations to Dental Records, and only their own", async () => {
    const r = await routesFor({ ...ADMIN, id: "d1", name: "Dr. Mike Johnson", role: "dentist" });
    expect(r).toEqual({
      "mine-confirmed": "/dentist/appointments",
      "mine-completed": "/dentist/records",
      "mine-walkin": "/dentist/appointments",
    });
  });

  it("admin: walk-ins to Walk-in Appointments, everything else to Appointments", async () => {
    const r = await routesFor(ADMIN);
    expect(r["mine-walkin"]).toBe("/admin/appointments");
    expect(r["mine-confirmed"]).toBe("/admin/online-appointments");
    expect(r["someone-elses"]).toBe("/admin/online-appointments");
  });

  it("patient: everything to My Appointments", async () => {
    const r = await routesFor({ ...ADMIN, id: "p1", name: "John Smith", role: "patient" });
    expect(new Set(Object.values(r))).toEqual(new Set(["/patient/appointments"]));
  });

  it("superadmin: everything to Reports & Analytics", async () => {
    const r = await routesFor({ ...ADMIN, id: "s1", name: "Super", role: "superadmin" });
    expect(new Set(Object.values(r))).toEqual(new Set(["/superadmin/reports"]));
  });
});

describe("a request still pending on its day", () => {
  function Titles() {
    const { items } = useNotifications();
    return <ul>{items.map(i => <li key={`${i.id}:${i.time}`}>{i.title}</li>)}</ul>;
  }
  const titlesFor = async (user: typeof ADMIN) => {
    h.user = user;
    render(<MemoryRouter><NotificationsProvider><Titles /></NotificationsProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    return screen.getAllByRole("listitem").map(li => li.textContent);
  };

  // Monday, Oct 26 2026 at 10:05 AM in Manila.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T02:05:00Z"));
    h.appts = [
      apt({ id: "later-today", patientName: "Jose", date: "2026-10-26", time: "14:00", service: "Oral" }),
      apt({ id: "tomorrow", patientName: "Maria", date: "2026-10-27", time: "09:00" }),
      apt({ id: "approved-today", patientName: "Ana", date: "2026-10-26", time: "15:00", status: "confirmed" }),
      apt({
        id: "expired", patientName: "Allen", date: "2026-10-25", time: "09:00", status: "rejected",
        reason: "Expired: not approved before the appointment time.",
      }),
    ];
  });
  afterEach(() => vi.useRealTimers());

  it("reminds the admin to approve or reject it before its time", async () => {
    const titles = await titlesFor(ADMIN);
    expect(titles[0]).toBe("Still pending: Jose's request for today at 2:00 PM (Oral). Approve or reject it before then");
    expect(titles.filter(t => t?.startsWith("Still pending"))).toHaveLength(1); // not tomorrow's, not the approved one
  });

  it("tells the dentist it's still waiting on their day", async () => {
    const titles = await titlesFor({ ...ADMIN, id: "d1", name: "Dr. Mike Johnson", role: "dentist" });
    expect(titles).toContain("Still awaiting approval: Jose's request for today at 2:00 PM (Oral)");
  });

  it("doesn't remind the patient", async () => {
    const titles = await titlesFor({ ...ADMIN, id: "p1", name: "John Smith", role: "patient" });
    expect(titles.some(t => t?.startsWith("Still"))).toBe(false);
  });

  it("drops the reminder once its time has come", async () => {
    vi.setSystemTime(new Date("2026-10-26T06:00:00Z")); // 2:00 PM
    const titles = await titlesFor(ADMIN);
    expect(titles.some(t => t?.startsWith("Still"))).toBe(false);
  });

  it("leaves a request the clock closed out of the bell", async () => {
    const titles = await titlesFor(ADMIN);
    expect(titles.some(t => t?.includes("Allen"))).toBe(false);
  });
});

describe("leave in the bell", () => {
  function Titles() {
    const { items } = useNotifications();
    return <ul>{items.map(i => <li key={`${i.id}:${i.time}`} data-route={i.route}>{i.title}</li>)}</ul>;
  }
  const leave = (over: Partial<import("@/lib/api/leave").LeaveRequest>) => ({
    id: "l1", dentistId: "dr-1", dentistName: "Aerhol Gocalin", role: "dentist" as const, startDate: "2026-11-03", endDate: "2026-11-05",
    reason: "Vacation", note: null, status: "pending" as const, decidedBy: null, decidedAt: null, decisionReason: null, removedDates: [], changedBy: null, changedAt: null, startTime: null, endTime: null,
    createdAt: "2026-10-26T01:00:00Z", updatedAt: "2026-10-26T01:00:00Z", conflicts: [], ...over,
  });
  const bell = async (user: typeof ADMIN) => {
    h.user = user;
    h.appts = [];
    render(<MemoryRouter><NotificationsProvider><Titles /></NotificationsProvider></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0));
    return screen.getAllByRole("listitem").map(li => [li.textContent, li.getAttribute("data-route")]);
  };
  afterEach(() => { h.leave = []; });

  it("tells the superadmin about a new request", async () => {
    h.leave = [leave({}), leave({ id: "l2", status: "approved" })];
    expect(await bell({ ...ADMIN, id: "s1", name: "Super", role: "superadmin" })).toEqual([
      ["Aerhol Gocalin requested leave: Nov 3 – Nov 5 (Vacation)", "/superadmin/schedule"],
    ]);
  });

  it("tells the dentist what was decided", async () => {
    h.leave = [
      leave({ status: "approved" }),
      leave({ id: "l2", startDate: "2026-12-01", endDate: "2026-12-01", status: "rejected", decisionReason: "Short-staffed", updatedAt: "2026-10-25T00:00:00Z" }),
      leave({ id: "l3", status: "pending" }),
    ];
    expect(await bell({ ...ADMIN, id: "d1", name: "Aerhol Gocalin", role: "dentist" })).toEqual([
      ["Your leave for Nov 3 – Nov 5 was approved", "/dentist/schedule"],
      ["Your leave for Dec 1 was rejected: Short-staffed", "/dentist/schedule"],
    ]);
  });

  it("tells an admin what was decided on their own leave, and opens their schedule", async () => {
    h.leave = [
      leave({ id: "mine", dentistId: ADMIN.id, dentistName: ADMIN.name, role: "admin", status: "rejected", decisionReason: "Clinic event that day" }),
      leave({ id: "theirs", status: "approved", updatedAt: "2026-10-20T00:00:00Z" }),
    ];
    expect(await bell(ADMIN)).toEqual([
      ["Your leave for Nov 3 – Nov 5 was rejected: Clinic event that day", "/admin/schedule"],
      ["Aerhol Gocalin is on leave Nov 3 – Nov 5 (Vacation)", "/admin"],
    ]);
  });

  it("tells the front desk who's away", async () => {
    h.leave = [leave({ status: "approved" })];
    expect(await bell(ADMIN)).toEqual([["Aerhol Gocalin is on leave Nov 3 – Nov 5 (Vacation)", "/admin"]]);
  });

  it("tells the dentist when the superadmin removes days, or calls the leave off", async () => {
    h.leave = [
      leave({ status: "approved", decidedAt: "2026-10-20T00:00:00Z", removedDates: ["2026-11-04", "2026-11-05"], changedBy: "Super Admin", changedAt: "2026-10-26T03:00:00Z" }),
      leave({ id: "l2", startDate: "2026-12-01", endDate: "2026-12-01", status: "cancelled", decidedAt: "2026-10-19T00:00:00Z",
        removedDates: ["2026-12-01"], changedBy: "Super Admin", changedAt: "2026-10-25T03:00:00Z" }),
    ];
    expect(await bell({ ...ADMIN, id: "d1", name: "Aerhol Gocalin", role: "dentist" })).toEqual([
      ["Days removed from your leave for Nov 3 – Nov 5: Nov 4, Nov 5. You work those days.", "/dentist/schedule"],
      ["Your leave for Dec 1 was cancelled by Super Admin", "/dentist/schedule"],
      ["Your leave for Nov 3 – Nov 5 was approved", "/dentist/schedule"],
    ]);
  });

  const change = (over = {}) => ({
    dates: ["2026-11-04"], startTime: null, endTime: null, note: null, status: "pending" as const,
    requestedAt: "2026-10-26T04:00:00Z", decidedBy: null, decidedAt: null, decisionReason: null, ...over,
  });

  it("tells the superadmin about a change asked to approved leave", async () => {
    h.leave = [leave({ status: "approved", changeRequest: change() })];
    expect(await bell({ ...ADMIN, id: "s1", name: "Super", role: "superadmin" })).toEqual([
      ["Aerhol Gocalin asks to change leave Nov 3 – Nov 5: work Nov 4", "/superadmin/schedule"],
    ]);
  });

  it("tells the dentist what was decided on the change", async () => {
    h.leave = [
      leave({ status: "approved", decidedAt: "2026-10-20T00:00:00Z", changeRequest: change({ status: "approved", decidedAt: "2026-10-26T05:00:00Z" }) }),
      leave({ id: "l2", startDate: "2026-12-01", endDate: "2026-12-01", startTime: "13:00", endTime: "17:00", status: "approved", decidedAt: "2026-10-19T00:00:00Z",
        changeRequest: change({ dates: [], startTime: "13:00", endTime: "15:00", status: "rejected", decidedAt: "2026-10-26T04:30:00Z", decisionReason: "Short-staffed" }) }),
    ];
    expect(await bell({ ...ADMIN, id: "d1", name: "Aerhol Gocalin", role: "dentist" })).toEqual([
      ["Your change to leave Nov 3 – Nov 5 was approved: you work Nov 4", "/dentist/schedule"],
      ["Your change to leave Dec 1, 1:00 PM – 5:00 PM was rejected: Short-staffed", "/dentist/schedule"],
      ["Your leave for Nov 3 – Nov 5 was approved", "/dentist/schedule"],
      ["Your leave for Dec 1, 1:00 PM – 5:00 PM was approved", "/dentist/schedule"],
    ]);
  });

  it("tells the dentist when the superadmin cuts part-day leave to fewer hours", async () => {
    h.leave = [leave({ startDate: "2026-11-03", endDate: "2026-11-03", startTime: "13:00", endTime: "15:00", status: "approved",
      decidedAt: "2026-10-20T00:00:00Z", changedBy: "Super Admin", changedAt: "2026-10-26T03:00:00Z" })];
    expect((await bell({ ...ADMIN, id: "d1", name: "Aerhol Gocalin", role: "dentist" }))[0]).toEqual(
      ["Your leave was changed by Super Admin: now Nov 3, 1:00 PM – 3:00 PM. You work the rest of that day.", "/dentist/schedule"]);
  });

  it("tells the front desk which days a colleague works after all", async () => {
    h.leave = [leave({ status: "approved", removedDates: ["2026-11-04"] })];
    expect(await bell(ADMIN)).toEqual([["Aerhol Gocalin is on leave Nov 3 – Nov 5, except Nov 4 (Vacation)", "/admin"]]);
  });
});
