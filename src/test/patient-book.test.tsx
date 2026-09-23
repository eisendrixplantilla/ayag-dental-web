import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The booking form runs for real; only the network and Radix's Select are replaced.
const h = vi.hoisted(() => ({ posted: [] as any[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "p1", name: "Allen Estrella", email: "allen@example.com", role: "patient", verified: true } }),
  api: vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      h.posted.push(body);
      return { appointment: { id: "new-1", ...body } };
    }
    if (path.includes("bookedSlots")) return { times: [] };
    return {};
  }),
}));

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return {
    ...actual,
    getDentistDirectory: vi.fn(async () => [{ id: "dr-mike", name: "Dr. Mike Johnson" }]),
    getDentistSchedule: vi.fn(async () => ({
      days: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
        dayOfWeek, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, durationMinutes: 60, maxPatient: null,
      })),
      unavailable: [],
    })),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

// Same swap as the admin tests: a native <select> with the same items, because
// opening a Radix Select in jsdom takes tens of seconds.
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

import PatientBook from "@/pages/patient/PatientBook";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => { h.posted = []; });
afterEach(cleanup);

const renderPage = async () => {
  render(<MemoryRouter><PatientBook /></MemoryRouter>);
  await screen.findByLabelText("Add a service");
};
const picker = () => screen.getByLabelText("Add a service") as HTMLSelectElement;
const options = () => within(picker()).getAllByRole("option").map(o => o.textContent).filter(Boolean);
const chips = () => screen.getAllByRole("button", { name: /^Remove / }).map(b => b.getAttribute("aria-label"));

describe("booking more than one service", () => {
  it("adds each pick to the visit and stops offering it again", async () => {
    await renderPage();
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();

    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(chips()).toEqual(["Remove Oral"]));
    expect(options()).not.toContain("Oral");

    fireEvent.change(picker(), { target: { value: "Veeners" } });
    await waitFor(() => expect(chips()).toEqual(["Remove Oral", "Remove Veeners"]));
    expect(options()).not.toContain("Veeners");
    expect(options()).toContain("Restoration"); // the rest are still on offer
  });

  it("takes a service back off the visit", async () => {
    await renderPage();
    fireEvent.change(picker(), { target: { value: "Oral" } });
    fireEvent.change(picker(), { target: { value: "Veeners" } });
    await waitFor(() => expect(chips()).toHaveLength(2));

    fireEvent.click(screen.getByRole("button", { name: "Remove Oral" }));
    await waitFor(() => expect(chips()).toEqual(["Remove Veeners"]));
    expect(options()).toContain("Oral"); // back on offer
  });

  it("keeps the dentist step locked until at least one service is chosen", async () => {
    await renderPage();
    const dentist = screen.getByLabelText("Choose a dentist") as HTMLSelectElement;
    expect(dentist).toBeDisabled();

    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(dentist).not.toBeDisabled());
  });
});

