import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

// My Appointments runs for real against a list long enough to page. Replaced: the
// network, and the print hook, whose document is the thing these tests check isn't
// cut down to the page on screen.
const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
  printed: null as any,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "p-1", name: "Maria Santos", email: "maria@example.com", role: "patient", verified: true } }),
  api: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/appointments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/appointments")>();
  return {
    ...actual,
    getAppointments: vi.fn(async () => h.appts),
    getBookedSlots: vi.fn(async () => []),
    rescheduleAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
  };
});

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: [] })) };
});

vi.mock("@/hooks/usePrintDocument", () => ({
  usePrintDocument: () => (doc: any) => { h.printed = doc; return true; },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import PatientAppointments from "@/pages/patient/PatientAppointments";
import { pageItems } from "@/lib/pageItems";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

/** `n` appointments, each with its own service name so a row is easy to find. */
const makeAppts = (n: number): Appointment[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `apt-${String(i + 1).padStart(3, "0")}`,
    patientName: "Maria Santos",
    service: `Service ${i + 1}`,
    dentistName: "Dr. Mike Johnson",
    dentistId: "d-1",
    date: "2027-03-10",
    time: "09:00",
    endTime: "09:30",
    status: "completed",
    type: "online",
    // Booked one minute apart, newest first — so "Service 1" is the newest.
    createdAt: new Date(Date.UTC(2026, 8, 25, 0, n - i)).toISOString(),
    rescheduleCount: 0,
  }) as Appointment);

const renderPage = async (n: number) => {
  h.appts = makeAppts(n);
  h.printed = null;
  render(<MemoryRouter><PatientAppointments /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText("Service 1")).toBeInTheDocument());
};

const pageBar = () => screen.getByRole("navigation", { name: "Pagination" });
const servicesOnScreen = () =>
  screen.getAllByText(/^Service \d+$/).map(el => el.textContent);

describe("My Appointments, one page at a time", () => {
  it("lists ten at a time and says which ten", async () => {
    await renderPage(23);
    expect(servicesOnScreen()).toHaveLength(10);
    expect(screen.getByText("Showing 1–10 of 23 appointment(s)")).toBeInTheDocument();
  });

  it("shows the next ten on page two, and the remainder on the last page", async () => {
    await renderPage(23);
    fireEvent.click(within(pageBar()).getByLabelText("Page 2"));
    await waitFor(() => expect(screen.getByText("Service 11")).toBeInTheDocument());
    expect(servicesOnScreen()).toHaveLength(10);
    expect(screen.queryByText("Service 10")).not.toBeInTheDocument();

    fireEvent.click(within(pageBar()).getByLabelText("Page 3"));
    await waitFor(() => expect(screen.getByText("Service 21")).toBeInTheDocument());
    expect(servicesOnScreen()).toHaveLength(3);
    expect(screen.getByText("Showing 21–23 of 23 appointment(s)")).toBeInTheDocument();
  });

  it("moves with Previous and Next, and stops at both ends", async () => {
    await renderPage(23);
    expect(within(pageBar()).getByLabelText("Previous page")).toBeDisabled();

    fireEvent.click(within(pageBar()).getByLabelText("Next page"));
    await waitFor(() => expect(screen.getByText("Service 11")).toBeInTheDocument());
    expect(within(pageBar()).getByLabelText("Previous page")).not.toBeDisabled();

    fireEvent.click(within(pageBar()).getByLabelText("Next page"));
    await waitFor(() => expect(screen.getByText("Service 21")).toBeInTheDocument());
    expect(within(pageBar()).getByLabelText("Next page")).toBeDisabled();

    fireEvent.click(within(pageBar()).getByLabelText("Previous page"));
    await waitFor(() => expect(screen.getByText("Service 11")).toBeInTheDocument());
  });

  it("doesn't show a page bar when everything already fits", async () => {
    await renderPage(10);
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
    expect(servicesOnScreen()).toHaveLength(10);
  });

  it("keeps the toolbar's count on the whole list, not the page on screen", async () => {
    await renderPage(23);
    // The toolbar badge counts the filtered list; the page bar says which slice of it.
    expect(screen.getByText("23 appointment(s)")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–10 of 23 appointment(s)")).toBeInTheDocument();
  });

  it("prints every appointment, not just the page being viewed", async () => {
    await renderPage(23);
    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(h.printed).not.toBeNull());
    const printedRows = h.printed.tables.flatMap((t: any) => t.rows);
    expect(printedRows).toHaveLength(23);
  });

  it("goes back to the first page when the filter changes", async () => {
    await renderPage(23);
    fireEvent.click(within(pageBar()).getByLabelText("Page 3"));
    await waitFor(() => expect(screen.getByText("Service 21")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/Filter these results/), { target: { value: "Service 1" } });
    await waitFor(() => expect(screen.getByText("Service 1")).toBeInTheDocument());
    // Page 3 of the old list would have been empty for the narrowed one.
    expect(screen.getByText(/^Showing 1–/)).toBeInTheDocument();
  });
});

describe("arriving from the notification bell", () => {
  it("turns to the page holding the appointment that was clicked", async () => {
    h.appts = makeAppts(23);
    // Service 21 is the 21st newest, so it sits on page 3.
    render(
      <MemoryRouter initialEntries={[{ pathname: "/patient/appointments", state: { highlightId: "apt-021" } }]}>
        <PatientAppointments />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Service 21")).toBeInTheDocument());
    expect(screen.getByText("Showing 21–23 of 23 appointment(s)")).toBeInTheDocument();
    // And it's flagged, which is the whole point of the jump.
    const card = screen.getByText("Service 21").closest("div[class*='rounded-lg']")!;
    expect(card.className).toContain("ring-primary/50");
  });

  it("leaves the first page alone when the target is already on it", async () => {
    h.appts = makeAppts(23);
    render(
      <MemoryRouter initialEntries={[{ pathname: "/patient/appointments", state: { highlightId: "apt-003" } }]}>
        <PatientAppointments />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Service 3")).toBeInTheDocument());
    expect(screen.getByText("Showing 1–10 of 23 appointment(s)")).toBeInTheDocument();
  });
});

describe("which page numbers the bar offers", () => {
  it("lists them all while they fit", () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("collapses the far runs once there are too many", () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, null, 20]);
    expect(pageItems(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
    expect(pageItems(20, 20)).toEqual([1, null, 17, 18, 19, 20]);
  });

  it("always keeps the current page and both its neighbours", () => {
    for (const page of [1, 2, 5, 11, 19, 20]) {
      const items = pageItems(page, 20);
      expect(items).toContain(page);
      if (page > 1) expect(items).toContain(page - 1);
      if (page < 20) expect(items).toContain(page + 1);
    }
  });

  it("never repeats an ellipsis", () => {
    for (let page = 1; page <= 30; page++) {
      const items = pageItems(page, 30);
      for (let i = 1; i < items.length; i++) {
        expect(items[i] === null && items[i - 1] === null).toBe(false);
      }
    }
  });
});
