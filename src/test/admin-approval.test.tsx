import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

// A fake server behind the real `api()` call sites: the page, the appointments API
// module and describeEmailOutcome all run for real; only the network is replaced.
const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
  emailSent: true as boolean | null,
  patches: [] as { id: string; body: Record<string, unknown> }[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", name: "Dr. Sarah Chen", email: "admin@admin.com", role: "admin", verified: true } }),
  api: vi.fn(async (path: string, init: RequestInit = {}) => {
    if (!init.method || init.method === "GET") return { appointments: h.appts };
    if (init.method === "PATCH") {
      const id = new URL(path, "http://x").searchParams.get("id")!;
      const body = JSON.parse(String(init.body));
      h.patches.push({ id, body });
      h.appts = h.appts.map(a => (a.id === id ? { ...a, ...body } : a));
      return { appointment: h.appts.find(a => a.id === id), emailSent: h.emailSent };
    }
    throw new Error(`unexpected ${init.method} ${path}`);
  }),
}));

const toasts = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

// Radix's Select needs pointer geometry jsdom doesn't have — opening one there takes
// tens of seconds. Swap it for a native <select> with the same items, which exercises
// the page's own filter wiring without the unusable dropdown.
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

import AdminOnlineAppointments from "@/pages/admin/AdminOnlineAppointments";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "x", patientId: "p1", patientName: "Someone", contact: null, email: "patient@example.com",
    dentistId: "d1", dentistName: "Dr. Mike Johnson", service: "Oral",
    date: "2026-09-25", time: "13:00", endTime: null, type: "online", status: "pending",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  };
}

// The filter bar: pick the column, then say what to look for.
const filterField = () => screen.getByLabelText("Filter by field") as HTMLSelectElement;
const filterBy = (columnIndex: string) => fireEvent.change(filterField(), { target: { value: columnIndex } });
const searchAll = (text: string) =>
  fireEvent.change(screen.getByLabelText("Filter these results"), { target: { value: text } });

// Scoped to the table: an open dialog shows the patient name too.
const rowOf = (name: string) =>
  within(document.querySelector("table") as HTMLElement).getByText(name).closest("tr")!;

beforeEach(() => {
  h.appts = [
    apt({ id: "pending-1", patientName: "Allen Estrella", email: "allen@example.com" }),
    apt({ id: "confirmed-1", patientName: "Pedro Reyes", status: "confirmed", time: "09:30" }),
  ];
  h.emailSent = true;
  h.patches = [];
  Object.values(toasts).forEach(fn => fn.mockClear());
});
afterEach(cleanup);

const renderPage = async () => {
  render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
  await screen.findByText("Allen Estrella");
};

// Approving and rejecting now live behind View, so most of these go through the dialog.
const openDetails = async (name: string) => {
  fireEvent.click(within(rowOf(name)).getAllByRole("button", { name: /View/ })[0]);
  return within(await screen.findByRole("dialog"));
};

describe("admin approve / reject", () => {
  it("leaves View as the only action in the table", async () => {
    await renderPage();
    for (const name of ["Allen Estrella", "Pedro Reyes"]) {
      const row = within(rowOf(name));
      expect(row.getAllByRole("button", { name: /View/ })).toHaveLength(2); // labelled + phone icon
      expect(row.queryByRole("button", { name: /Approve|Confirm/ })).toBeNull();
      expect(row.queryByRole("button", { name: /Reject/ })).toBeNull();
    }
  });

  it("offers Confirm and Reject inside the View dialog of a pending booking", async () => {
    await renderPage();
    const dialog = await openDetails("Allen Estrella");
    expect(dialog.getByRole("button", { name: /Confirm Appointment/ })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: /Reject Appointment/ })).toBeInTheDocument();
  });

  it("offers neither once the booking is already confirmed", async () => {
    await renderPage();
    const dialog = await openDetails("Pedro Reyes");
    expect(dialog.queryByRole("button", { name: /Confirm Appointment/ })).toBeNull();
    expect(dialog.queryByRole("button", { name: /Reject Appointment/ })).toBeNull();
  });

  it("shows times in 12-hour format", async () => {
    await renderPage();
    expect(within(rowOf("Allen Estrella")).getByText("1:00 PM")).toBeInTheDocument();
    expect(within(rowOf("Pedro Reyes")).getByText("9:30 AM")).toBeInTheDocument();
  });

  it("approving confirms it, reports the email as sent, and drops the dialog's actions", async () => {
    await renderPage();
    const dialog = await openDetails("Allen Estrella");
    fireEvent.click(dialog.getByRole("button", { name: /Confirm Appointment/ }));

    await waitFor(() => expect(h.patches).toEqual([{ id: "pending-1", body: { status: "confirmed" } }]));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Appointment approved", {
      description: "Confirmation email sent to allen@example.com.",
    }));
    await waitFor(() => expect(within(rowOf("Allen Estrella")).getByText("confirmed")).toBeInTheDocument());
    expect(dialog.queryByRole("button", { name: /Confirm Appointment/ })).toBeNull();
  });

  it("warns instead of claiming success when the email fails to send", async () => {
    h.emailSent = false;
    await renderPage();
    const dialog = await openDetails("Allen Estrella");
    fireEvent.click(dialog.getByRole("button", { name: /Confirm Appointment/ }));

    await waitFor(() => expect(toasts.warning).toHaveBeenCalledWith("Appointment approved", {
      description: expect.stringContaining("couldn't be sent"),
    }));
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("rejecting requires a reason, sends it, and reports the email", async () => {
    await renderPage();
    const details = await openDetails("Allen Estrella");
    fireEvent.click(details.getByRole("button", { name: /Reject Appointment/ }));

    const send = await screen.findByRole("button", { name: /Reject & Notify/ });
    const reject = within(send.closest("[role=dialog]") as HTMLElement);
    expect(send).toBeDisabled(); // no reason yet
    fireEvent.change(reject.getByRole("textbox"), { target: { value: "Dentist on leave that day" } });
    fireEvent.click(send);

    await waitFor(() => expect(h.patches).toEqual([
      { id: "pending-1", body: { status: "rejected", reason: "Dentist on leave that day" } },
    ]));
    await waitFor(() => expect(toasts.success).toHaveBeenCalledWith("Appointment rejected", {
      description: "Rejection email sent to allen@example.com.",
    }));
  });
});

describe("the appointments list", () => {
  it("puts the newest bookings first, whatever order the server sent them in", async () => {
    h.appts = [
      apt({ id: "old", patientName: "Pedro Reyes", createdAt: "2026-09-20T08:00:00Z" }),
      apt({ id: "newest", patientName: "Maria Santos", createdAt: "2026-09-23T17:45:00Z" }),
      apt({ id: "middle", patientName: "Allen Estrella", createdAt: "2026-09-22T10:00:00Z" }),
    ];
    await renderPage();

    const names = screen.getAllByRole("row").slice(1).map(r => (r as HTMLTableRowElement).cells[1].textContent);
    expect(names).toEqual(["Maria Santos", "Allen Estrella", "Pedro Reyes"]);
  });

  it("shows when each booking was created, in Manila time", async () => {
    h.appts = [apt({ patientName: "Allen Estrella", createdAt: "2026-09-22T00:00:00Z" })];
    await renderPage();
    // 00:00 UTC is 8am the same morning in Manila, wherever the admin is sitting.
    expect(within(rowOf("Allen Estrella")).getByText("Sep 22, 2026, 8:00 AM")).toBeInTheDocument();
  });

  it("narrows the list to one service, and clears back again", async () => {
    h.appts = [
      apt({ id: "a", patientName: "Allen Estrella", service: "Oral Prophylaxis" }),
      apt({ id: "b", patientName: "Pedro Reyes", service: "Tooth Extraction" }),
    ];
    await renderPage();

    filterBy("2"); // Service
    const select = await screen.findByLabelText("Filter by Service");
    // Only the services actually booked are offered — no hard-coded menu to drift.
    expect(within(select).getAllByRole("option").map(o => o.textContent))
      .toEqual(["Any service", "Oral Prophylaxis", "Tooth Extraction"]);

    fireEvent.change(select, { target: { value: "Tooth Extraction" } });
    await waitFor(() => expect(screen.queryByText("Allen Estrella")).toBeNull());
    expect(screen.getByText("Pedro Reyes")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2); // header + the one match

    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));
    await waitFor(() => expect(screen.getByText("Allen Estrella")).toBeInTheDocument());
  });

  it("lists a multi-service booking under each of its services", async () => {
    h.appts = [
      apt({ id: "a", patientName: "Allen Estrella", service: "Oral, Veeners" }),
      apt({ id: "b", patientName: "Pedro Reyes", service: "Restoration" }),
    ];
    await renderPage();

    filterBy("2"); // Service
    const select = await screen.findByLabelText("Filter by Service");
    // Split apart: "Oral, Veeners" is two services, not a third option of its own.
    expect(within(select).getAllByRole("option").map(o => o.textContent))
      .toEqual(["Any service", "Oral", "Restoration", "Veeners"]);

    for (const service of ["Oral", "Veeners"]) {
      fireEvent.change(select, { target: { value: service } });
      await waitFor(() => expect(screen.queryByText("Pedro Reyes")).toBeNull());
      expect(screen.getByText("Allen Estrella")).toBeInTheDocument();
    }

    fireEvent.change(select, { target: { value: "Restoration" } });
    await waitFor(() => expect(screen.getByText("Pedro Reyes")).toBeInTheDocument());
    expect(screen.queryByText("Allen Estrella")).toBeNull();
  });

  it("keeps only the appointments inside the chosen date range", async () => {
    h.appts = [
      apt({ id: "a", patientName: "Allen Estrella", date: "2026-09-20" }),
      apt({ id: "b", patientName: "Pedro Reyes", date: "2026-09-25" }),
      apt({ id: "c", patientName: "Maria Santos", date: "2026-10-02" }),
    ];
    await renderPage();
    const names = () => Array.from(document.querySelectorAll("tbody tr"))
      .map(r => (r as HTMLTableRowElement).cells[1].textContent);

    filterBy("4"); // Date
    await screen.findByLabelText("From date");
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-24" } });
    await waitFor(() => expect(names()).toEqual(["Pedro Reyes", "Maria Santos"]));

    fireEvent.change(screen.getByLabelText("To date"), { target: { value: "2026-09-30" } });
    await waitFor(() => expect(names()).toEqual(["Pedro Reyes"]));

    // Either end on its own is a valid, open-ended range.
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "" } });
    await waitFor(() => expect(names()).toEqual(["Allen Estrella", "Pedro Reyes"]));

    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));
    await waitFor(() => expect(names()).toHaveLength(3));
  });

  it("gives each appointment a short reference, and finds it by that", async () => {
    h.appts = [
      apt({ id: "3f9c2a10-0000-4000-8000-000000000001", patientName: "Allen Estrella" }),
      apt({ id: "b7d41e55-0000-4000-8000-000000000002", patientName: "Pedro Reyes" }),
    ];
    await renderPage();

    expect(within(rowOf("Allen Estrella")).getByText("APT-3F9C2A")).toBeInTheDocument();
    expect(within(rowOf("Pedro Reyes")).getByText("APT-B7D41E")).toBeInTheDocument();

    searchAll("apt-3f9c2a");
    await waitFor(() => expect(screen.queryByText("Pedro Reyes")).toBeNull());
    expect(screen.getByText("Allen Estrella")).toBeInTheDocument();

    // The bare reference works too, as does the full id somebody pasted in.
    searchAll("b7d41e");
    await waitFor(() => expect(screen.getByText("Pedro Reyes")).toBeInTheDocument());
    searchAll("3f9c2a10-0000-4000-8000-000000000001");
    await waitFor(() => expect(screen.getByText("Allen Estrella")).toBeInTheDocument());
    expect(screen.queryByText("Pedro Reyes")).toBeNull();
  });

  it("marks a patient's reschedule as a request, not just another pending booking", async () => {
    h.appts = [
      apt({ id: "moved", patientName: "Allen Estrella", status: "pending", rescheduleCount: 1 }),
      apt({ id: "new", patientName: "Pedro Reyes", status: "pending", rescheduleCount: 0 }),
    ];
    await renderPage();

    expect(within(rowOf("Allen Estrella")).getByText("reschedule request")).toBeInTheDocument();
    expect(within(rowOf("Pedro Reyes")).getByText("pending")).toBeInTheDocument();

    // Either way it's the admin's call: both still offer Approve and Reject.
    for (const name of ["Allen Estrella", "Pedro Reyes"]) {
      const dialog = await openDetails(name);
      expect(dialog.getByRole("button", { name: /Confirm Appointment/ })).toBeInTheDocument();
      expect(dialog.getByRole("button", { name: /Reject Appointment/ })).toBeInTheDocument();
      fireEvent.click(dialog.getAllByRole("button", { name: /^Close$/ })[0]);
    }
  });

  it("keeps the filter bar and the table in one card", async () => {
    await renderPage();
    const card = screen.getByRole("table").closest(".bg-card") as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByLabelText("Filter by field")).toBeInTheDocument();
    expect(within(card).getByText(/appointment\(s\)/)).toBeInTheDocument(); // the count sits with them

    // Clear only shows up once something is actually filtered.
    expect(within(card).queryByRole("button", { name: /Clear filter/ })).toBeNull();
    searchAll("maria");
    await waitFor(() =>
      expect(within(card).getByRole("button", { name: /Clear filter/ })).toBeInTheDocument());
  });

  it("offers every column of the table to filter by", async () => {
    await renderPage();
    expect(within(filterField()).getAllByRole("option").map(o => o.textContent)).toEqual([
      "All fields", "Reference", "Patient Name", "Service", "Assigned Dentist",
      "Date", "Time", "Booked On", "Type", "Status",
    ]);
  });
});
