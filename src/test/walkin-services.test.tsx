import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The walk-in form runs for real. Replaced: the network, and the three Radix/cmdk
// widgets jsdom can't drive (Select, Popover, Command).
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", name: "Dr. Sarah Chen", email: "admin@admin.com", role: "admin", verified: true } }),
  api: vi.fn(async (path: string) => {
    if (path.startsWith("/patients")) return { patients: [] };
    if (path.includes("bookedSlots")) return { times: [] };
    return { appointments: [] };
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
