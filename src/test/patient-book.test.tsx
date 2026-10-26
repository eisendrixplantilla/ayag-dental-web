import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The booking form runs for real; only the network and Radix's Select are replaced.
const h = vi.hoisted(() => ({ posted: [] as any[], services: [] as any[], booked: [] as any[], profiles: [] as any[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "p1", name: "Allen Estrella", email: "allen@example.com", role: "patient", verified: true } }),
  api: vi.fn(async (path: string, init: RequestInit = {}) => {
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      h.posted.push(body);
      return { appointment: { id: "new-1", ...body } };
    }
    if (path.includes("bookedSlots")) return { times: h.booked.map((b: any) => b.time), slots: h.booked };
    // The clinic's own list, as the superadmin maintains it under Dental Services & Pricing.
    if (path.includes("services=true")) return { services: h.services };
    if (path.includes("dentistProfiles=true")) return { dentists: h.profiles };
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
        dayOfWeek, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
      })),
      unavailable: [],
    })),
  };
});

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

// Left permanently open, and the calendar reduced to a button that picks one day —
// neither widget can be driven in jsdom.
vi.mock("@/components/ui/popover", async () => {
  const React = await import("react");
  const div = ({ children }: any) => React.createElement("div", null, children);
  return { Popover: div, PopoverTrigger: div, PopoverContent: div };
});
vi.mock("@/components/ui/calendar", async () => {
  const React = await import("react");
  return {
    Calendar: ({ onSelect }: any) =>
      React.createElement("button", { onClick: () => onSelect(new Date(2027, 2, 10)) }, "Pick Mar 10"),
  };
});
vi.mock("@/components/BookingCalendar", async () => {
  const React = await import("react");
  return {
    default: ({ onSelect }: any) =>
      React.createElement("button", { onClick: () => onSelect(new Date(2027, 2, 10)) }, "Pick Mar 10"),
  };
});

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

// The dentist cards are a dialog; here the picker is a plain <select> of the one dentist.
vi.mock("@/components/DentistPicker", async () => {
  const React = await import("react");
  return {
    default: ({ label = "Choose a dentist", disabled, selectedId, onChoose }: any) =>
      React.createElement(
        "select",
        { "aria-label": label, disabled, value: selectedId ?? "", onChange: (e: any) => onChoose(e.target.value) },
        [
          React.createElement("option", { key: "", value: "" }, ""),
          React.createElement("option", { key: "dr-mike", value: "dr-mike" }, "Dr. Mike Johnson"),
        ],
      ),
  };
});

import PatientBook from "@/pages/patient/PatientBook";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  h.posted = [];
  h.services = [];
  h.booked = [];
  h.profiles = [];
  Object.values(toasts).forEach(fn => fn.mockClear());
});
afterEach(cleanup);

const renderPage = async () => {
  render(<MemoryRouter><PatientBook /></MemoryRouter>);
  await screen.findByLabelText("Choose a service");
};
const picker = () => screen.getByLabelText("Choose a service") as HTMLSelectElement;
const options = () => within(picker()).getAllByRole("option").map(o => o.textContent).filter(Boolean);
const chips = () => screen.getAllByRole("button", { name: /^Remove / }).map(b => b.getAttribute("aria-label"));

const chooseMike = async () => {
  await waitFor(() => expect(screen.getByLabelText("Choose a dentist")).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText("Choose a dentist"), { target: { value: "dr-mike" } });
  await waitFor(() => expect(picker()).not.toBeDisabled());
};

describe("one service per booking", () => {
  it("takes one service; picking another replaces it", async () => {
    await renderPage();
    await chooseMike();

    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(picker().value).toBe("Oral"));
    fireEvent.change(picker(), { target: { value: "Veneers" } });
    await waitFor(() => expect(picker().value).toBe("Veneers"));
    expect(options()).toContain("Oral"); // still on offer, just not chosen
  });

  it("offers only the services the chosen dentist does", async () => {
    h.profiles = [{ id: "dr-mike", name: "Dr. Mike Johnson", photoUrl: null, services: ["Oral", "Veneers"], days: [], limits: [], hours: [] }];
    await renderPage();
    await waitFor(() => expect(screen.getByLabelText("Choose a dentist")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Choose a dentist"), { target: { value: "dr-mike" } });

    await waitFor(() => expect(options()).toEqual(["Oral", "Veneers"]));
  });

  it("asks for the dentist first, and only then offers services", async () => {
    await renderPage();
    expect(picker()).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText("Choose a dentist")).not.toBeDisabled());

    fireEvent.change(screen.getByLabelText("Choose a dentist"), { target: { value: "dr-mike" } });
    await waitFor(() => expect(picker()).not.toBeDisabled());
  });
});


describe("the services on offer", () => {
  const catalog = [
    { id: "1", name: "Braces", description: null, duration: 60, price: null },
    { id: "2", name: "Check-up", description: null, duration: 30, price: null },
    { id: "3", name: "Typo service", description: null, duration: null, price: null },
  ];

  it("comes from the clinic's own list, and only what has a duration", async () => {
    h.services = catalog;
    await renderPage();
    await waitFor(() => expect(options()).toEqual(["Braces", "Check-up"]));
    // Not the built-in fallback list.
    expect(options()).not.toContain("Root Canal");
    expect(options()).not.toContain("Typo service");
  });

  it("makes the visit as long as the service chosen", async () => {
    h.services = catalog;
    await renderPage();
    await waitFor(() => expect(options()).toContain("Braces"));

    fireEvent.change(picker(), { target: { value: "Braces" } });
    await waitFor(() => expect(screen.getByText(/About 1 hr/)).toBeInTheDocument());

    // One service at a time: the visit is as long as the one chosen.
    fireEvent.change(picker(), { target: { value: "Check-up" } });
    await waitFor(() => expect(screen.getByText(/About 30 min/)).toBeInTheDocument());
  });

  it("falls back to the built-in list when the clinic's can't be loaded", async () => {
    h.services = [];
    await renderPage();
    expect(options()).toContain("Root Canal");
  });
});

describe("slots while the form sits open", () => {
  // The times are buttons now, not a dropdown: the free slots are on the page.
  const slotGroup = () => screen.getByRole("group", { name: "Available time slots" });
  const slotOptions = () => within(slotGroup()).getAllByRole("button").map(b => b.textContent);
  const pickSlot = (label: string) => fireEvent.click(within(slotGroup()).getByRole("button", { name: label }));
  const chosenSlot = () =>
    within(slotGroup()).queryAllByRole("button", { pressed: true }).map(b => b.textContent);

  const pickVisit = async () => {
    await renderPage();
    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(screen.getByLabelText("Choose a dentist")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Choose a dentist"), { target: { value: "dr-mike" } });
    fireEvent.click(await screen.findByRole("button", { name: "Pick Mar 10" }));
    await waitFor(() => expect(slotOptions().length).toBeGreaterThan(0));
  };

  it("offers every free half hour of the dentist's day", async () => {
    await pickVisit();
    expect(slotOptions()[0]).toBe("9:00 AM – 9:30 AM");
    expect(slotOptions()).toContain("4:30 PM – 5:00 PM");
  });

  it("leaves out what another patient already holds", async () => {
    h.booked = [{ time: "09:00", endTime: "10:00" }];
    await pickVisit();
    expect(slotOptions()).not.toContain("9:00 AM – 9:30 AM");
    expect(slotOptions()).not.toContain("9:30 AM – 10:00 AM"); // inside the same booking
    expect(slotOptions()[0]).toBe("10:00 AM – 10:30 AM");
  });

  it("offers another service with the same dentist once one is booked", async () => {
    await pickVisit();
    pickSlot("9:00 AM – 9:30 AM");
    fireEvent.click(await screen.findByRole("button", { name: /Confirm Appointment/ }));

    const another = await screen.findByRole("button", { name: "Book another service with Dr. Mike Johnson" });
    expect(h.posted).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/patient/appointments");
    fireEvent.click(another);
    // The dentist stays chosen; the service, date and time start over.
    await waitFor(() => expect((screen.getByLabelText("Choose a dentist") as HTMLSelectElement).value).toBe("dr-mike"));
    expect(picker().value).toBe("");
  });

  it("doesn't call the patient's own new booking 'just taken'", async () => {
    await pickVisit();
    pickSlot("9:00 AM – 9:30 AM");
    fireEvent.click(await screen.findByRole("button", { name: /Confirm Appointment/ }));
    await screen.findByText("Appointment Request Submitted");

    // Their booking now holds the time; coming back to the tab refreshes the times.
    h.booked = [{ time: "09:00", endTime: "09:30" }];
    fireEvent(window, new Event("focus"));
    await new Promise((r) => setTimeout(r, 50));

    expect(toasts.info).not.toHaveBeenCalled();
    expect(screen.getByText(/at 9:00 AM – 9:30 AM with Dr. Mike Johnson/)).toBeInTheDocument();
  });

  it("marks the time chosen, so it is obvious which one is held", async () => {
    await pickVisit();
    expect(chosenSlot()).toEqual([]);

    pickSlot("9:00 AM – 9:30 AM");
    await waitFor(() => expect(chosenSlot()).toEqual(["9:00 AM – 9:30 AM"]));
  });

  it("drops a time somebody else takes while this form is open, and says so", async () => {
    await pickVisit();
    pickSlot("9:00 AM – 9:30 AM");
    await waitFor(() => expect(chosenSlot()).toEqual(["9:00 AM – 9:30 AM"]));

    // Another patient books it; coming back to the tab picks that up.
    h.booked = [{ time: "09:00", endTime: "09:30" }];
    fireEvent(window, new Event("focus"));

    await waitFor(() => expect(slotOptions()).not.toContain("9:00 AM – 9:30 AM"));
    expect(chosenSlot()).toEqual([]);
    expect(toasts.info).toHaveBeenCalledWith("That time has just been taken. Please choose another.");
  });
});

describe("what the form tells you about the date you are picking", () => {
  const slotGroup = () => screen.getByRole("group", { name: "Available time slots" });

  const pickVisit = async () => {
    await renderPage();
    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(screen.getByLabelText("Choose a dentist")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Choose a dentist"), { target: { value: "dr-mike" } });
    fireEvent.click(await screen.findByRole("button", { name: "Pick Mar 10" }));
    await waitFor(() => expect(within(slotGroup()).getAllByRole("button").length).toBeGreaterThan(0));
  };

  it("spells out the dentist's working hours, and doesn't whisper them", async () => {
    await renderPage();
    fireEvent.change(picker(), { target: { value: "Oral" } });
    await waitFor(() => expect(screen.getByLabelText("Choose a dentist")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Choose a dentist"), { target: { value: "dr-mike" } });

    const label = await screen.findByText("Working hours:");
    expect(label.className).toMatch(/font-semibold/);
    // Which days exist on the calendar below, and the hours within them.
    expect(label.parentElement!.textContent).toMatch(/Sun 9:00 AM–5:00 PM/);
    // Not hint grey: it reads in the body colour.
    expect(label.closest("p")!.className).not.toMatch(/text-muted-foreground/);
  });

  it("says which day the times belong to, and how many are left", async () => {
    await pickVisit();

    const heading = screen.getByText(/^Times on /);
    expect(heading.textContent).toBe("Times on Wed, Mar 10");
    expect(heading.className).toMatch(/font-semibold/);
    expect(heading.className).toMatch(/text-foreground/);

    // The count is a badge beside it rather than another line of small grey text.
    const count = screen.getByText(/free$/);
    expect(count.className).toMatch(/bg-success/);
  });

  it("reads the whole booking back before Confirm, set apart from the form", async () => {
    await pickVisit();
    fireEvent.click(within(slotGroup()).getByRole("button", { name: "9:00 AM – 9:30 AM" }));

    const readback = (await screen.findByText("March 10th, 2027")).closest("p")!;
    expect(readback.textContent).toBe("Oral with Dr. Mike Johnson on March 10th, 2027 at 9:00 AM – 9:30 AM.");
    // Each thing being booked carries weight, and the whole line is set apart.
    expect(within(readback).getAllByText(/Oral|Dr. Mike Johnson|March 10th, 2027|9:00 AM – 9:30 AM/)
      .every(el => /font-semibold/.test(el.className))).toBe(true);
    expect(readback.className).toContain("bg-primary/5");

    // Before a time is chosen it is a prompt, not a summary.
    expect(screen.queryByText(/Pick a dentist, a service/)).toBeNull();
  });

  it("prompts for what is still missing until a time is chosen", async () => {
    await renderPage();
    expect(screen.getByText(/Pick a dentist, a service, a date and a time to continue/)).toBeInTheDocument();
  });
});
