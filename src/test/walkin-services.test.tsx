import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The walk-in form runs for real. Replaced: the network, and the three Radix/cmdk
// widgets jsdom can't drive (Select, Popover, Command).
const h = vi.hoisted(() => ({ walkIns: [] as any[], deleted: [] as string[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", name: "Dr. Sarah Chen", email: "admin@admin.com", role: "admin", verified: true } }),
  api: vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "DELETE") {
      h.deleted.push(new URLSearchParams(path.split("?")[1]).get("id") ?? "");
      return {};
    }
    if (path.startsWith("/patients")) return { patients: [] };
    if (path.includes("bookedSlots")) return { times: [] };
    return { appointments: h.walkIns };
  }),
}));

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return {
    ...actual,
    getDentistDirectory: vi.fn(async () => [{ id: "dr-mike", name: "Dr. Mike Johnson" }]),
    getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: [] })),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

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

// Left permanently open, so the name box is reachable without driving the popover.
vi.mock("@/components/ui/popover", async () => {
  const React = await import("react");
  const div = ({ children }: any) => React.createElement("div", null, children);
  return { Popover: div, PopoverTrigger: div, PopoverContent: div };
});

vi.mock("@/components/ui/command", async () => {
  const React = await import("react");
  const div = ({ children }: any) => React.createElement("div", null, children);
  return {
    Command: div,
    CommandInput: ({ value, onValueChange, placeholder }: any) =>
      React.createElement("input", { placeholder, value, onChange: (e: any) => onValueChange(e.target.value) }),
    CommandList: div,
    CommandEmpty: div,
    CommandGroup: div,
    CommandItem: ({ children, onSelect }: any) => React.createElement("button", { onClick: onSelect }, children),
  };
});

import AdminAppointments from "@/pages/admin/AdminAppointments";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const picker = () => screen.getByLabelText("Add a service") as HTMLSelectElement;
const options = () => within(picker()).getAllByRole("option").map(o => o.textContent).filter(Boolean);
const chips = () => screen.getAllByRole("button", { name: /^Remove / }).map(b => b.getAttribute("aria-label"));

const renderPage = async () => {
  render(<MemoryRouter><AdminAppointments /></MemoryRouter>);
  await screen.findByLabelText("Add a service");
};
const nameWalkIn = () =>
  fireEvent.change(screen.getByPlaceholderText("Type a name..."), { target: { value: "Rosa Mendoza" } });

describe("walk-in appointments cover more than one service", () => {
  it("waits for a patient name before offering services", async () => {
    await renderPage();
    expect(picker()).toBeDisabled();

    nameWalkIn();
    await waitFor(() => expect(picker()).not.toBeDisabled());
  });

  it("adds each pick to the visit and stops offering it again", async () => {
    await renderPage();
    nameWalkIn();
    await waitFor(() => expect(picker()).not.toBeDisabled());

    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(chips()).toEqual(["Remove Oral"]));
    expect(options()).not.toContain("Oral");

    fireEvent.change(picker(), { target: { value: "Veeners" } });
    await waitFor(() => expect(chips()).toEqual(["Remove Oral", "Remove Veeners"]));
    expect(options()).toContain("Restoration"); // the rest are still on offer
  });

  it("takes a service back off the visit, and gates the dentist on having one", async () => {
    await renderPage();
    nameWalkIn();
    await waitFor(() => expect(picker()).not.toBeDisabled());

    const dentist = screen.getByLabelText("Assign dentist") as HTMLSelectElement;
    expect(dentist).toBeDisabled();

    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(dentist).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Remove Oral" }));
    await waitFor(() => expect(dentist).toBeDisabled());
    expect(options()).toContain("Oral"); // back on offer
  });
});

describe("what the walk-in list lets you do", () => {
  const walkIn = {
    id: "3f9c2a10-0000-4000-8000-00000000000a",
    patientId: null,
    patientName: "Rosa Mendoza",
    contact: "09171234567",
    email: null,
    dentistId: "dr-mike",
    dentistName: "Dr. Mike Johnson",
    service: "Oral",
    date: "2026-09-25",
    time: "09:00",
    endTime: "09:30",
    type: "walk-in",
    status: "confirmed",
    reason: null,
    remarks: null,
    rescheduleCount: 0,
    createdBy: "admin",
    createdAt: "2026-09-24T01:00:00Z",
  };

  beforeEach(() => {
    h.walkIns = [walkIn];
    h.deleted = [];
  });

  const openView = async () => {
    render(<MemoryRouter><AdminAppointments /></MemoryRouter>);
    await screen.findByText("Rosa Mendoza");
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    await screen.findByText("Walk-in Appointment");
  };
  const inDialog = (name: RegExp) =>
    screen.getAllByRole("button", { name }).find(b => b.closest("[role=dialog]")) as HTMLElement;

  it("puts everything behind the eye — no delete button loose in the row", async () => {
    render(<MemoryRouter><AdminAppointments /></MemoryRouter>);
    await screen.findByText("Rosa Mendoza");

    const row = screen.getByText("Rosa Mendoza").closest("tr")!;
    const actions = within(row).getAllByRole("button").map(b => b.getAttribute("aria-label"));
    expect(actions).toEqual(["View details"]);
  });

  it("shows the appointment's details behind it", async () => {
    await openView();

    // The row behind the dialog shows the same names, so look inside the dialog.
    const dialog = within(document.querySelector("[role=dialog]") as HTMLElement);
    expect(dialog.getByText("APT-3F9C2A")).toBeInTheDocument();
    expect(dialog.getByText("09171234567")).toBeInTheDocument();
    expect(dialog.getByText("Dr. Mike Johnson")).toBeInTheDocument();
    expect(dialog.getByText("9:00 AM – 9:30 AM")).toBeInTheDocument();
    expect(dialog.getByText(/Sep 24, 2026/)).toBeInTheDocument(); // booked on
  });

  it("asks before removing, and removes on confirmation", async () => {
    await openView();
    fireEvent.click(inDialog(/^Remove$/));

    // The details step hands over to a confirmation rather than deleting on one click.
    await screen.findByText("Remove this walk-in?");
    expect(h.deleted).toEqual([]);

    fireEvent.click(inDialog(/^Remove$/));
    await waitFor(() => expect(h.deleted).toEqual(["3f9c2a10-0000-4000-8000-00000000000a"]));
  });

  it("leaves the appointment alone if the confirmation is dismissed", async () => {
    await openView();
    fireEvent.click(inDialog(/^Remove$/));
    await screen.findByText("Remove this walk-in?");

    fireEvent.click(inDialog(/^Cancel$/));
    await waitFor(() => expect(screen.queryByText("Remove this walk-in?")).toBeNull());
    expect(h.deleted).toEqual([]);
  });
});
