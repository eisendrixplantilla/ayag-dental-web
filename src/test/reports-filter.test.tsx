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
    await waitFor(() => expect(screen.getByText(/No records match this filter/)).toBeInTheDocument());

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
  const valuePicker = (name: string) => screen.getByLabelText(`Filter by ${name}`) as HTMLSelectElement;
  const pick = (name: string, value: string) => fireEvent.change(valuePicker(name), { target: { value } });
  const chooseField = (index: string) => fireEvent.change(field(), { target: { value: index } });

  it("offers every column of the report to filter by", async () => {
    await generate();
    expect(within(field()).getAllByRole("option").map(o => o.textContent).filter(Boolean))
      .toEqual(["All fields", "Reference", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"]);
  });

  it("offers the values that column actually holds, so nothing has to be typed", async () => {
    await generate();
    chooseField("3"); // Service
    await waitFor(() => expect(valuePicker("Service")).toBeInTheDocument());
    expect(within(valuePicker("Service")).getAllByRole("option").map(o => o.textContent).filter(Boolean))
      .toEqual(["Any service", "Oral", "Root Canal"]);

    pick("Service", "Oral");
    await waitFor(() => expect(names()).toEqual(["Maria Santos", "Pedro Reyes"]));

    pick("Service", "all"); // back to any
    await waitFor(() => expect(names()).toHaveLength(3));
  });

  it("filters by dentist, status, date and reference the same way", async () => {
    await generate();

    chooseField("2"); // Dentist
    await waitFor(() => expect(valuePicker("Dentist")).toBeInTheDocument());
    pick("Dentist", "Aerhol Gocalin");
    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));

    chooseField("5"); // Status
    await waitFor(() => expect(valuePicker("Status")).toBeInTheDocument());
    pick("Status", "Confirmed");
    await waitFor(() => expect(names()).toHaveLength(3));

    chooseField("0"); // Reference
    await waitFor(() => expect(valuePicker("Reference")).toBeInTheDocument());
    pick("Reference", "APT-3F9C2A");
    await waitFor(() => expect(names()).toEqual(["Allen Estrella"]));
  });

  it("switching the field drops what was filtered for the old one", async () => {
    await generate();
    fireEvent.change(screen.getByLabelText("Filter the generated report"), { target: { value: "maria" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));

    // Before, "maria" carried over to the new column and emptied the table.
    chooseField("5"); // Status
    await waitFor(() => expect(names()).toHaveLength(3));
    expect(screen.getByText("3 record(s)")).toBeInTheDocument();
  });

  it("goes back to typing when a column holds too many values to list", async () => {
    h.appts = Array.from({ length: 20 }, (_, i) =>
      apt({ id: `${i}0000000-0000-4000-8000-00000000000${i.toString(16)}`, patientName: `Patient ${i}` }));
    render(<MemoryRouter><AdminReports /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText("Report type"), { target: { value: "appointment" } });
    fireEvent.click(screen.getByRole("button", { name: /Generate Report/ }));
    await waitFor(() => expect(dataRows()).toHaveLength(20));

    chooseField("1"); // Patient Name — 20 distinct
    await waitFor(() => expect(screen.getByLabelText("Filter the generated report")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Filter the generated report"), { target: { value: "Patient 7" } });
    await waitFor(() => expect(names()).toEqual(["Patient 7"]));
  });

  it("names the column it was filtered by on the printed document", async () => {
    await generate();
    chooseField("3");
    await waitFor(() => expect(valuePicker("Service")).toBeInTheDocument());
    pick("Service", "Root Canal");
    await waitFor(() => expect(names()).toEqual(["Allen Estrella"]));

    fireEvent.click(screen.getByRole("button", { name: /Print Report/ }));
    expect(printed.calls[0].filters).toContainEqual({ label: "Filtered By", value: "Service: Root Canal" });
    expect(printed.calls[0].rows).toHaveLength(1);
  });
});

describe("filtering a date column by range", () => {
  const chooseField = (index: string) =>
    fireEvent.change(screen.getByLabelText("Filter by field"), { target: { value: index } });
  const from = () => screen.getByLabelText("From date");
  const to = () => screen.getByLabelText("To date");

  beforeEach(() => {
    h.appts = [
      apt({ id: "3f9c2a10-0000-4000-8000-00000000000a", patientName: "Allen Estrella", date: "2026-09-20" }),
      apt({ id: "b7d41e55-0000-4000-8000-00000000000b", patientName: "Maria Santos", date: "2026-09-25" }),
      apt({ id: "c2e58a99-0000-4000-8000-00000000000c", patientName: "Pedro Reyes", date: "2026-10-02" }),
    ];
  });

  it("offers a date range instead of a list of dates", async () => {
    await generate();
    chooseField("4"); // Appointment Date

    await waitFor(() => expect(from()).toBeInTheDocument());
    expect(to()).toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by Appointment Date")).toBeNull();
  });

  it("keeps only the records inside the range, either end optional", async () => {
    await generate();
    chooseField("4");
    await waitFor(() => expect(from()).toBeInTheDocument());

    fireEvent.change(from(), { target: { value: "2026-09-24" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos", "Pedro Reyes"]));

    fireEvent.change(to(), { target: { value: "2026-09-30" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));

    fireEvent.change(from(), { target: { value: "" } });
    await waitFor(() => expect(names()).toEqual(["Allen Estrella", "Maria Santos"]));
  });

  it("counts what is showing and clears back to everything", async () => {
    await generate();
    chooseField("4");
    await waitFor(() => expect(from()).toBeInTheDocument());
    fireEvent.change(from(), { target: { value: "2026-10-01" } });

    await waitFor(() => expect(screen.getByText("1 of 3 record(s)")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));
    await waitFor(() => expect(names()).toHaveLength(3));
  });

  it("prints the range on the document, however it was bounded", async () => {
    await generate();
    chooseField("4");
    await waitFor(() => expect(from()).toBeInTheDocument());

    fireEvent.change(from(), { target: { value: "2026-09-21" } });
    fireEvent.change(to(), { target: { value: "2026-09-30" } });
    await waitFor(() => expect(names()).toEqual(["Maria Santos"]));

    fireEvent.click(screen.getByRole("button", { name: /Print Report/ }));
    expect(printed.calls[0].filters).toContainEqual({
      label: "Filtered By", value: "Appointment Date: 2026-09-21 to 2026-09-30",
    });
    expect(printed.calls[0].rows).toHaveLength(1);
  });

  it("drops the range when another field is chosen", async () => {
    await generate();
    chooseField("4");
    await waitFor(() => expect(from()).toBeInTheDocument());
    fireEvent.change(from(), { target: { value: "2026-10-01" } });
    await waitFor(() => expect(names()).toEqual(["Pedro Reyes"]));

    chooseField("1"); // Patient Name
    await waitFor(() => expect(names()).toHaveLength(3));
  });
});
