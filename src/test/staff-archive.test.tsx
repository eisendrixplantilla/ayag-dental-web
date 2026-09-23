import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Both pages run for real. Replaced: the network, and Radix Select (jsdom can't drive it).
const h = vi.hoisted(() => ({
  staff: [] as any[],
  archived: [] as any[],
  archiveCalls: [] as { id: string; reason: string; by?: string }[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "su-1", name: "Super Administrator", email: "super@admin.com", role: "superadmin", verified: true },
  }),
  api: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return {
    ...actual,
    getStaff: vi.fn(async () => h.staff),
    getArchivedStaff: vi.fn(async () => h.archived),
    restoreStaff: vi.fn(async () => h.archived[0]),
    archiveStaff: vi.fn(async (id: string, reason: string, by?: string) => {
      h.archiveCalls.push({ id, reason, by });
      return h.staff[0];
    }),
    getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: [] })),
  };
});

vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return { ...actual, getArchivedPatients: vi.fn(async () => []), restorePatient: vi.fn(async () => ({}) as any) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const items = (node: any): any[] =>
    React.Children.toArray(node).flatMap((c: any) =>
      c?.props?.value !== undefined ? [c] : c?.props?.children ? items(c.props.children) : []);
  const passthrough = ({ children }: any) => children ?? null;
  return {
    Select: ({ value, onValueChange, disabled, children }: any) =>
      React.createElement(
        "select",
        {
          "aria-label": (React.Children.toArray(children) as any[])
            .find(c => c?.props?.["aria-label"])?.props["aria-label"],
          value,
          disabled,
          onChange: (e: any) => onValueChange(e.target.value),
        },
        items(children).map((i: any) =>
          React.createElement("option", { key: i.props.value, value: i.props.value }, i.props.children)),
      ),
    SelectTrigger: passthrough,
    SelectContent: passthrough,
    SelectItem: passthrough,
    SelectValue: () => null,
  };
});

import SuperAdminStaff from "@/pages/superadmin/SuperAdminStaff";
import SuperAdminArchives from "@/pages/superadmin/SuperAdminArchives";
import { archiveStaff } from "@/lib/api/staff";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const member = (over: Partial<any> = {}) => ({
  id: "dentist-1",
  employeeId: "EMP-002",
  name: "Dr. Mike Johnson",
  email: "dentist@ayagdental.com",
  contact: "09171234567",
  role: "dentist",
  status: "active",
  photoUrl: null,
  createdAt: "2026-01-04",
  archivedAt: null,
  archivedBy: null,
  archivedReason: null,
  ...over,
});

beforeEach(() => {
  h.staff = [member()];
  h.archived = [];
  h.archiveCalls = [];
  vi.mocked(archiveStaff).mockClear();
});

const openArchiveDialog = async () => {
  render(<MemoryRouter><SuperAdminStaff /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Archive" }));
  await screen.findByText("Archive Staff Account");
};
const reasonBox = () => screen.getByLabelText("Reason for archiving");
const confirmButton = () =>
  screen.getAllByRole("button", { name: /^Archive$/ }).find(b => b.closest("[role=dialog]")) as HTMLButtonElement;

describe("archiving an admin or dentist asks why", () => {
  it("asks for a reason and will not archive without one", async () => {
    await openArchiveDialog();

    expect(reasonBox()).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(reasonBox(), { target: { value: "   " } }); // blank doesn't count
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(reasonBox(), { target: { value: "Resigned effective September 30, 2026." } });
    await waitFor(() => expect(confirmButton()).not.toBeDisabled());
  });

  it("sends the reason and who archived it", async () => {
    await openArchiveDialog();
    fireEvent.change(reasonBox(), { target: { value: "  Resigned effective September 30, 2026.  " } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(h.archiveCalls).toHaveLength(1));
    expect(h.archiveCalls[0]).toEqual({
      id: "dentist-1",
      reason: "Resigned effective September 30, 2026.", // trimmed
      by: "Super Administrator",
    });
  });

  it("starts each archive with an empty box, so a reason can't be inherited", async () => {
    await openArchiveDialog();
    fireEvent.change(reasonBox(), { target: { value: "Transferred to another branch" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Archive Staff Account")).toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: "Archive" })[0]);
    await screen.findByText("Archive Staff Account");
    expect(reasonBox()).toHaveValue("");
    expect(confirmButton()).toBeDisabled();
  });
});

describe("the Archive shows why an account was archived", () => {
  beforeEach(() => {
    h.archived = [member({
      status: "archived",
      archivedAt: "2026-09-24",
      archivedBy: "Super Administrator",
      archivedReason: "Resigned effective September 30, 2026.",
    })];
  });

  it("lists the reason, the date and who did it", async () => {
    render(<MemoryRouter><SuperAdminArchives /></MemoryRouter>);

    const row = await screen.findByText("Dr. Mike Johnson");
    const cells = Array.from(row.closest("tr")!.querySelectorAll("td")).map(c => c.textContent);
    expect(cells).toContain("Resigned effective September 30, 2026.");
    expect(cells).toContain("2026-09-24"); // the day it was archived, not the day it was created
    expect(cells).toContain("Super Administrator");
  });

  it("repeats the reason in the account's details", async () => {
    render(<MemoryRouter><SuperAdminArchives /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /View/ }));

    await screen.findByText("Archived Staff Account");
    const dialog = document.querySelector("[role=dialog]") as HTMLElement;
    expect(within(dialog).getByText("Reason")).toBeInTheDocument();
    expect(within(dialog).getByText("Resigned effective September 30, 2026.")).toBeInTheDocument();
  });
});
