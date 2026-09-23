import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

// The report page runs for real; the network, the toasts, Radix's Select and the
// printer are replaced.
const h = vi.hoisted(() => ({ appts: [] as Appointment[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", name: "Dr. Sarah Chen", email: "admin@admin.com", role: "admin", verified: true } }),
  api: vi.fn(async (path: string) => {
    if (path.startsWith("/patients")) return { patients: [] };
    return { appointments: h.appts };
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const printed = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock("@/lib/printReport", () => ({
  printReport: (doc: any) => { printed.calls.push(doc); return true; },
}));

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
        [
          React.createElement("option", { key: "__none", value: "" }, ""),
          ...items(children).map((i: any) =>
            React.createElement("option", { key: i.props.value, value: i.props.value }, i.props.children)),
        ],
      ),
    SelectTrigger: passthrough,
    SelectContent: passthrough,
    SelectItem: passthrough,
    SelectValue: () => null,
  };
});

import AdminReports from "@/pages/admin/AdminReports";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "00000000-0000-4000-8000-000000000001", patientId: "p1", patientName: "Someone", contact: null, email: null,
    dentistId: "d1", dentistName: "Dr. Mike Johnson", service: "Oral",
    date: "2026-09-25", time: "13:00", endTime: null, type: "online", status: "confirmed",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  printed.calls = [];
  h.appts = [
    apt({ id: "3f9c2a10-0000-4000-8000-00000000000a", patientName: "Allen Estrella", service: "Root Canal" }),
    apt({ id: "b7d41e55-0000-4000-8000-00000000000b", patientName: "Maria Santos", service: "Oral", dentistName: "Aerhol Gocalin" }),
    apt({ id: "c2e58a99-0000-4000-8000-00000000000c", patientName: "Pedro Reyes", service: "Oral" }),
  ];
});

const dataRows = () => Array.from(document.querySelectorAll("tbody tr"));
const names = () => dataRows().map(r => (r as HTMLTableRowElement).cells[1]?.textContent);

const generate = async () => {
  render(<MemoryRouter><AdminReports /></MemoryRouter>);
  const type = await screen.findByLabelText("Report type");
  fireEvent.change(type, { target: { value: "appointment" } });
  fireEvent.click(screen.getByRole("button", { name: /Generate Report/ }));
  await waitFor(() => expect(dataRows()).toHaveLength(3));
};

describe("filtering a report that has already been generated", () => {
  it("narrows the rows without running the report again", async () => {
    await generate();
    fireEvent.change(screen.getByLabelText("Filter the generated report"), { target: { value: "maria" } });

    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));
    expect(screen.getByText("1 of 3 record(s)")).toBeInTheDocument();
  });

  it("matches any column, not just the name", async () => {
    await generate();
    const filter = screen.getByLabelText("Filter the generated report");

    fireEvent.change(filter, { target: { value: "root canal" } });
    await waitFor(() => expect(names()).toEqual(["Allen Estrella"]));

    fireEvent.change(filter, { target: { value: "Aerhol" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));
  });

  it("says so when nothing matches, and clears back to everything", async () => {
    await generate();
    fireEvent.change(screen.getByLabelText("Filter the generated report"), { target: { value: "zzz" } });
    await waitFor(() => expect(screen.getByText(/No records match "zzz"/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));
    await waitFor(() => expect(dataRows()).toHaveLength(3));
    expect(screen.getByText("3 record(s)")).toBeInTheDocument();
  });

  it("prints what is on screen, and names the filter on the document", async () => {
    await generate();
    fireEvent.change(screen.getByLabelText("Filter the generated report"), { target: { value: "oral" } });
    await waitFor(() => expect(dataRows()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: /Print Report/ }));
    expect(printed.calls).toHaveLength(1);
    const doc = printed.calls[0];
    expect(doc.rows).toHaveLength(2);
    expect(doc.rows.map((r: string[]) => r[1])).toEqual(["Maria Santos", "Pedro Reyes"]);
    expect(doc.filters).toContainEqual({ label: "Filtered By", value: "oral" });
    expect(doc.preparedBy).toEqual({ name: "Dr. Sarah Chen", role: "Clinic Admin" });
  });

  it("prints every row when nothing is filtered", async () => {
    await generate();
    fireEvent.click(screen.getByRole("button", { name: /Print Report/ }));

    expect(printed.calls[0].rows).toHaveLength(3);
    expect(printed.calls[0].filters.map((f: any) => f.label)).not.toContain("Filtered By");
  });

  it("offers Print on its own — there is no separate PDF button", async () => {
    await generate();
    expect(screen.getByRole("button", { name: /Print Report/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download PDF/ })).toBeNull();
  });
});

describe("filtering by one field", () => {
  const field = () => screen.getByLabelText("Filter by field") as HTMLSelectElement;
  const text = () => screen.getByLabelText("Filter the generated report");

  it("offers every column of the report to filter by", async () => {
    await generate();
    expect(within(field()).getAllByRole("option").map(o => o.textContent).filter(Boolean))
      .toEqual(["All fields", "Reference", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"]);
  });

  it("searches only the column chosen", async () => {
    await generate();
    // "Oral" is a service here, and every row's dentist or patient could contain other
    // words — scoping to Service keeps it to the two Oral appointments.
    fireEvent.change(field(), { target: { value: "3" } }); // Service
    fireEvent.change(text(), { target: { value: "oral" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos", "Pedro Reyes"]));

    // The same text against Patient Name matches nobody.
    fireEvent.change(field(), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByText(/No records match "oral"/)).toBeInTheDocument());
  });

  it("filters by status, dentist and appointment date", async () => {
    await generate();
    fireEvent.change(field(), { target: { value: "5" } }); // Status
    fireEvent.change(text(), { target: { value: "confirmed" } });
    await waitFor(() => expect(names()).toHaveLength(3));

    fireEvent.change(field(), { target: { value: "2" } }); // Dentist
    fireEvent.change(text(), { target: { value: "aerhol" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));

    fireEvent.change(field(), { target: { value: "4" } }); // Appointment Date
    fireEvent.change(text(), { target: { value: "2026-09-25" } });
    await waitFor(() => expect(names()).toHaveLength(3));
  });

  it("filters by reference", async () => {
    await generate();
    fireEvent.change(field(), { target: { value: "0" } }); // Reference
    fireEvent.change(text(), { target: { value: "3f9c2a" } });
    await waitFor(() => expect(names()).toEqual(["Allen Estrella"]));
  });

  it("names the column it was filtered by on the printed document", async () => {
    await generate();
    fireEvent.change(field(), { target: { value: "3" } });
    fireEvent.change(text(), { target: { value: "root canal" } });
    await waitFor(() => expect(names()).toEqual(["Allen Estrella"]));

    fireEvent.click(screen.getByRole("button", { name: /Print Report/ }));
    expect(printed.calls[0].filters).toContainEqual({ label: "Filtered By", value: "Service: root canal" });
    expect(printed.calls[0].rows).toHaveLength(1);
  });
});
