import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Every list's filter bar is the same component, so this checks the bar itself and
// then that two real pages are wired to it.
const h = vi.hoisted(() => ({ staff: [] as any[], patients: [] as any[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "su-1", name: "Super Administrator", email: "super@admin.com", role: "superadmin", verified: true } }),
  api: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getStaff: vi.fn(async () => h.staff), getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: [] })) };
});
vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return { ...actual, getPatients: vi.fn(async () => h.patients) };
});
vi.mock("@/lib/printReport", () => ({ printReport: () => true, ROWS_PER_PAGE: 20 }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const items = (node: any): any[] =>
    React.Children.toArray(node).flatMap((c: any) =>
      c?.props?.value !== undefined ? [c] : c?.props?.children ? items(c.props.children) : []);
  const passthrough = ({ children }: any) => children ?? null;
  return {
    Select: ({ value, onValueChange, children }: any) =>
      React.createElement(
        "select",
        {
          "aria-label": (React.Children.toArray(children) as any[])
            .find(c => c?.props?.["aria-label"])?.props["aria-label"],
          value,
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

import TableToolbar, { FilterField, FilterRange, FilterSearch } from "@/components/TableToolbar";
import SuperAdminStaff from "@/pages/superadmin/SuperAdminStaff";
import AdminAccounts from "@/pages/admin/AdminAccounts";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

beforeEach(() => {
  h.staff = [
    { id: "s1", employeeId: "EMP-001", name: "Dr. Sarah Chen", email: "admin@admin.com", contact: "0912",
      role: "admin", status: "active", photoUrl: null, createdAt: "2026-01-04" },
    { id: "s2", employeeId: "EMP-003", name: "Dr. Mike Johnson", email: "dentist@ayagdental.com", contact: "0913",
      role: "dentist", status: "active", photoUrl: null, createdAt: "2026-01-05" },
  ];
  h.patients = [
    { id: "p1", name: "Maria Santos", email: "maria@example.com", status: "active", createdAt: "2026-09-20",
      phone: "0917", age: 30, appointmentsCount: 0, dentalRecordsCount: 0 },
    { id: "p2", name: "Pedro Reyes", email: "pedro@example.com", status: "inactive", createdAt: "2026-09-25",
      phone: "0918", age: 41, appointmentsCount: 0, dentalRecordsCount: 0 },
  ];
});

describe("the filter bar above a table", () => {
  it("counts the rows, and says how many of how many once narrowed", () => {
    const { rerender } = render(<TableToolbar count={36} total={36} />);
    expect(screen.getByText("36 record(s)")).toBeInTheDocument();

    rerender(<TableToolbar count={7} total={36} />);
    expect(screen.getByText("7 of 36 record(s)")).toBeInTheDocument();
  });

  it("names what the rows are when the page says so", () => {
    render(<TableToolbar count={4} total={4} noun="appointment(s)" />);
    expect(screen.getByText("4 appointment(s)")).toBeInTheDocument();
  });

  it("keeps the page's own buttons beside the count", () => {
    render(<TableToolbar count={1} actions={<button>Print</button>} />);
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("offers Clear only when the page passes a way to clear", () => {
    const clear = vi.fn();
    const { rerender } = render(<TableToolbar count={1} />);
    expect(screen.queryByRole("button", { name: /Clear filters/ })).toBeNull();

    rerender(<TableToolbar count={1} onClear={clear} />);
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(clear).toHaveBeenCalled();
  });

  it("labels each control, and bounds one end of a range by the other", () => {
    render(
      <TableToolbar count={0}>
        <FilterSearch placeholder="Search..." value="" onChange={() => {}} />
        <FilterField label="Role"><select aria-label="Filter by role" /></FilterField>
        <FilterRange from="2026-09-01" to="2026-09-30" onFrom={() => {}} onTo={() => {}} />
      </TableToolbar>,
    );

    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
    expect(screen.getByText("Date range")).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toHaveAttribute("max", "2026-09-30");
    expect(screen.getByLabelText("To date")).toHaveAttribute("min", "2026-09-01");
  });
});

describe("the pages use it", () => {
  it("counts the staff, and narrows the count as the list is filtered", async () => {
    render(<MemoryRouter><SuperAdminStaff /></MemoryRouter>);
    await screen.findByText("Dr. Mike Johnson");
    expect(screen.getByText("2 account(s)")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search by Employee ID/), { target: { value: "mike" } });
    await waitFor(() => expect(screen.getByText("1 of 2 account(s)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() => expect(screen.getByText("2 account(s)")).toBeInTheDocument());
  });

  it("puts the count and Print together above the patient accounts table", async () => {
    render(<MemoryRouter><AdminAccounts /></MemoryRouter>);
    await screen.findByText("Maria Santos");

    const bar = screen.getByText("2 account(s)").closest("div")!.parentElement as HTMLElement;
    expect(within(bar).getByRole("button", { name: /Print/ })).toBeInTheDocument();
    expect(screen.getByLabelText("From date")).toBeInTheDocument();
    expect(screen.getByLabelText("To date")).toBeInTheDocument();
  });
});
