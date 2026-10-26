import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { StaffMember, UnavailableDate } from "@/lib/api/staff";

const h = vi.hoisted(() => ({
  role: "dentist" as StaffMember["role"],
  unavailable: [] as UnavailableDate[],
  added: [] as unknown[][],
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "s1", name: "Super", role: "superadmin" } }), api: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/api/staff", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/staff")>()),
  // The link carries the Employee ID; the page finds the account behind it.
  getStaff: vi.fn(async () => [{ id: "dr-1", employeeId: "DT-261001", name: "Aerhol Gocalin", role: h.role }]),
  getStaffMember: vi.fn(async () => ({
    id: "dr-1", employeeId: "EMP-09192026", name: "Aerhol Gocalin", email: "a@x.com", contact: null,
    role: h.role, status: "active", photoUrl: null, createdAt: null,
  })),
  getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: h.unavailable })),
  addDentistUnavailable: vi.fn(async (...args: unknown[]) => {
    h.added.push(args);
    const entry = args[1] as { date: string; reason?: string; remarks?: string };
    return { id: "u-new", date: entry.date, reason: entry.reason ?? null, remarks: entry.remarks ?? null };
  }),
}));
vi.mock("@/lib/api/booking", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/booking")>()),
  getDentistProfiles: vi.fn(async () => []),
  getServiceLimits: vi.fn(async () => []),
}));
vi.mock("@/lib/api/dentalRecords", async (orig) => ({ ...(await orig<typeof import("@/lib/api/dentalRecords")>()), getServices: vi.fn(async () => []) }));
vi.mock("@/lib/api/leave", async (orig) => ({ ...(await orig<typeof import("@/lib/api/leave")>()), getLeave: vi.fn(async () => []) }));
// Radix Select can't be driven in jsdom; a plain <select> stands in, named by its trigger.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const items = (node: any): any[] =>
    React.Children.toArray(node).flatMap((c: any) =>
      c?.props?.value !== undefined ? [c] : c?.props?.children ? items(c.props.children) : []);
  const passthrough = ({ children }: any) => children ?? null;
  return {
    Select: ({ value, onValueChange, children }: any) => React.createElement("select", {
      "aria-label": (React.Children.toArray(children) as any[]).find((c) => c?.props?.["aria-label"])?.props["aria-label"],
      value,
      onChange: (e: any) => onValueChange(e.target.value),
    }, [
      React.createElement("option", { key: "__none", value: "" }, ""),
      ...items(children).map((i: any) => React.createElement("option", { key: i.props.value, value: i.props.value }, i.props.children)),
    ]),
    SelectTrigger: passthrough, SelectContent: passthrough, SelectItem: passthrough, SelectValue: () => null,
  };
});

import SuperAdminDentistSchedule from "@/pages/superadmin/SuperAdminDentistSchedule";

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { h.role = "dentist"; h.unavailable = []; h.added = []; });
afterEach(cleanup);

const renderPage = async () => {
  render(
    <MemoryRouter initialEntries={["/superadmin/staff/DT-261001/schedule"]}>
      <Routes><Route path="/superadmin/staff/:id/schedule" element={<SuperAdminDentistSchedule />} /></Routes>
    </MemoryRouter>,
  );
  // The Leave card: their requests and days off in one table.
  const card = (await screen.findByText("Their leave requests and days off, and how each stands.", { exact: false })).closest(".shadow-card") as HTMLElement;
  return within(card);
};

describe("days off on a staff schedule page", () => {
  it("are listed as set by the clinic, with a way to delete each", async () => {
    h.unavailable = [{ id: "u1", date: "2026-11-04", reason: "Personal", remarks: "Family matter" }];
    const card = await renderPage();
    const row = (await card.findByText("Personal")).closest("tr")!;
    expect(within(row).getByText("Set by the clinic")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Delete day off Nov 4" })).toBeInTheDocument();
  });

  it("can't be added here any more: leave is added on the Schedule page", async () => {
    const card = await renderPage();
    expect(card.queryByRole("button", { name: /Add Day Off/ })).toBeNull();
  });
});
