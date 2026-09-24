import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Every list filters the same way as a generated report: pick a column, then say what
// to look for. This covers the bar itself and two real pages wired to it.
const h = vi.hoisted(() => ({ staff: [] as any[], patients: [] as any[] }));
const printed = vi.hoisted(() => ({ calls: [] as any[] }));

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
vi.mock("@/lib/printReport", () => ({
  printReport: (doc: any) => { printed.calls.push(doc); return true; },
  ROWS_PER_PAGE: 20,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

// Radix's Select can't be driven in jsdom; a native <select> with the same items can.
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

import TableToolbar from "@/components/TableToolbar";
import { EMPTY_FILTER, type ReportFilter } from "@/lib/reportFilter";
import SuperAdminStaff from "@/pages/superadmin/SuperAdminStaff";
import AdminAccounts from "@/pages/admin/AdminAccounts";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

beforeEach(() => {
  printed.calls = [];
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

const COLUMNS = ["Name", "Status", "Date"];
const ROWS = [
  ["Maria Santos", "Active", "2026-09-20"],
  ["Pedro Reyes", "Deactivated", "2026-09-25"],
];

/** Renders the bar with its filter state held for it, as a page does. */
function Harness({ noun, actions }: { noun?: string; actions?: ReactNode } = {}) {
  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER);
  const shown = ROWS.filter((r) =>
    filter.field === "all"
      ? r.join(" ").toLowerCase().includes(filter.value.toLowerCase())
      : true);
  return (
    <TableToolbar
      columns={COLUMNS}
      rows={ROWS}
      filter={filter}
      onChange={setFilter}
      shown={shown.length}
      noun={noun}
      actions={actions}
    />
  );
}

const field = () => screen.getByLabelText("Filter by field") as HTMLSelectElement;
const chooseField = (index: string) => fireEvent.change(field(), { target: { value: index } });

describe("the filter bar above a table", () => {
  it("offers every column of the table to filter by", () => {
    render(<Harness />);
    expect(within(field()).getAllByRole("option").map(o => o.textContent))
      .toEqual(["All fields", "Name", "Status", "Date"]);
  });

  it("counts the rows, and names what they are", () => {
    render(<Harness noun="account(s)" />);
    expect(screen.getByText("2 account(s)")).toBeInTheDocument();
  });

  it("keeps the page's own buttons beside the count", () => {
    render(<Harness actions={<button>Print</button>} />);
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("asks for a range on a column of dates, and a list on a short column", async () => {
    render(<Harness />);

    chooseField("2"); // Date
    await waitFor(() => expect(screen.getByLabelText("From date")).toBeInTheDocument());
    expect(screen.getByLabelText("To date")).toBeInTheDocument();

    chooseField("1"); // Status — two distinct values
    await waitFor(() => expect(screen.getByLabelText("Filter by Status")).toBeInTheDocument());
    expect(within(screen.getByLabelText("Filter by Status")).getAllByRole("option").map(o => o.textContent))
      .toEqual(["Any status", "Active", "Deactivated"]);
  });

  it("shows Clear only once something is filtered", async () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: /Clear filter/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Filter these results"), { target: { value: "maria" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Clear filter/ })).toBeInTheDocument());
  });
});

describe("the pages filter by column", () => {
  it("narrows the staff list by a column, and says how many of how many", async () => {
    render(<MemoryRouter><SuperAdminStaff /></MemoryRouter>);
    await screen.findByText("Dr. Mike Johnson");
    expect(screen.getByText("2 account(s)")).toBeInTheDocument();

    chooseField("4"); // Role
    await waitFor(() => expect(screen.getByLabelText("Filter by Role")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Filter by Role"), { target: { value: "Dentist" } });

    await waitFor(() => expect(screen.getByText("1 of 2 account(s)")).toBeInTheDocument());
    expect(screen.queryByText("Dr. Sarah Chen")).toBeNull();
  });

  it("filters patient accounts by a date range and prints what is left", async () => {
    render(<MemoryRouter><AdminAccounts /></MemoryRouter>);
    await screen.findByText("Maria Santos");

    chooseField("3"); // Date Registered
    await waitFor(() => expect(screen.getByLabelText("From date")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-22" } });

    await waitFor(() => expect(screen.queryByText("Maria Santos")).toBeNull());
    expect(screen.getByText("1 of 2 account(s)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    expect(printed.calls[0].rows.map((r: string[]) => r[0])).toEqual(["Pedro Reyes"]);
    expect(printed.calls[0].filters).toContainEqual({
      label: "Filtered By", value: "Date Registered: from 2026-09-22",
    });
  });
});
