import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";

// The Appointments table has ten columns. Two things used to squeeze it into a
// horizontal scrollbar: the shell capped every page at a readable column width, and
// the shared TableCell forces `whitespace-nowrap`, so one long name set the table's
// minimum width regardless of how much room the page had.
const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "a-1", name: "Admin", email: "admin@admin.com", role: "admin", verified: true }, logout: vi.fn() }),
  api: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/appointments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/appointments")>();
  return { ...actual, getAppointments: vi.fn(async () => h.appts), updateAppointment: vi.fn() };
});

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistDirectory: vi.fn(async () => []), getDentistSchedule: vi.fn(async () => ({ days: [] })) };
});

vi.mock("@/lib/api/dentalRecords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dentalRecords")>();
  return { ...actual, getServices: vi.fn(async () => []) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import DashboardLayout from "@/components/DashboardLayout";
import AdminOnlineAppointments from "@/pages/admin/AdminOnlineAppointments";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const appointment = (over: Partial<Appointment> = {}): Appointment => ({
  id: "3f9c2a1b-0000-4000-8000-000000000000",
  patientName: "Maria Lourdes Villanueva-Santos",
  service: "Orthodontics (Braces) Adjustment",
  dentistName: "Dr. Margarette Ayag-Plantilla",
  date: "2026-10-02",
  time: "09:00",
  endTime: "09:45",
  status: "pending",
  type: "online",
  createdAt: "2026-09-25T01:00:00.000Z",
  rescheduleCount: 0,
} as Appointment);

/** The content column the page's children sit in. */
const contentColumn = (container: HTMLElement) => container.querySelector("main > div");

describe("the page shell's content width", () => {
  it("caps an ordinary page at a readable column", () => {
    const { container } = render(
      <MemoryRouter><DashboardLayout><p>a form</p></DashboardLayout></MemoryRouter>,
    );
    expect(contentColumn(container)?.className).toContain("max-w-screen-xl");
  });

  it("lets a table-heavy page use the whole width instead", () => {
    const { container } = render(
      <MemoryRouter><DashboardLayout wide><p>a table</p></DashboardLayout></MemoryRouter>,
    );
    expect(contentColumn(container)?.className).not.toContain("max-w-screen-xl");
    expect(contentColumn(container)?.className).toContain("w-full");
  });
});

describe("the Appointments table pages at ten", () => {
  const rowCount = (c: HTMLElement) => c.querySelectorAll("tbody tr").length;

  it("shows ten of fifteen, then the rest", async () => {
    h.appts = Array.from({ length: 15 }, (_, i) =>
      appointment({ id: `0000000${i}-0000-4000-8000-00000000000${i.toString(16)}`, patientName: `Patient ${i + 1}` }));
    const { container } = render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(rowCount(container)).toBe(10));
    expect(screen.getByText("Showing 1–10 of 15 appointment(s)")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Next page"));
    await waitFor(() => expect(rowCount(container)).toBe(5));
    expect(screen.getByText("Showing 11–15 of 15 appointment(s)")).toBeInTheDocument();
  });

  it("shows no page bar when ten or fewer fit", async () => {
    h.appts = Array.from({ length: 10 }, (_, i) =>
      appointment({ id: `0000000${i}-0000-4000-8000-00000000000${i.toString(16)}` }));
    const { container } = render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(rowCount(container)).toBe(10));
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });
});

describe("the Appointments table's own width", () => {
  it("lets the long text columns wrap rather than setting the table's minimum width", async () => {
    h.appts = [appointment()];
    render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Maria Lourdes Villanueva-Santos")).toBeInTheDocument());

    for (const text of [
      "Maria Lourdes Villanueva-Santos",
      "Orthodontics (Braces) Adjustment",
      "Dr. Margarette Ayag-Plantilla",
    ]) {
      const cell = screen.getByText(text).closest("td")!;
      expect(cell.className).toContain("whitespace-normal");
      expect(cell.className).toContain("break-words");
    }
  });

  it("tightens the cell padding, which is the single biggest slice of its width", async () => {
    h.appts = [appointment()];
    const { container } = render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(container.querySelector("table")).toBeInTheDocument());
    // Ten columns of the shared p-4 spend 320px on padding alone.
    const table = container.querySelector("table")!;
    expect(table.className).toContain("[&_td]:px-2");
    expect(table.className).toContain("[&_th]:px-2");
    // The headers carry whitespace-nowrap from the shared TableHead, so "Assigned Dentist"
    // sets that column's floor however narrow its values are. Let them wrap too.
    expect(table.className).toContain("[&_th]:whitespace-normal");
  });

  it("lets the widest single-line columns wrap — time, booked-on and the status badge", async () => {
    h.appts = [appointment()];
    const { container } = render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(container.querySelector("tbody tr")).toBeInTheDocument());
    const cells = container.querySelectorAll("tbody tr:first-child td");
    expect(cells[5].className).toContain("whitespace-normal");  // Time
    expect(cells[5].className).not.toContain("whitespace-nowrap");
    expect(cells[6].className).toContain("whitespace-normal");  // Booked On
    expect(cells[8].querySelector("[class*=whitespace-normal]")).not.toBeNull(); // Status badge
  });

  it("doesn't put a floor under the text columns that the old padding didn't have", async () => {
    h.appts = [appointment()];
    const { container } = render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(container.querySelector("tbody tr")).toBeInTheDocument());
    // A min-width on a cell is honoured in auto table layout, so three columns pinned at
    // 8rem would add 384px back to the very width this is trying to reclaim.
    for (const cell of container.querySelectorAll("tbody tr:first-child td")) {
      expect(cell.className).not.toContain("min-w-[8rem]");
    }
  });

  it("still keeps the short columns on one line, where a wrap would read as two rows", async () => {
    h.appts = [appointment()];
    render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("2026-10-02")).toBeInTheDocument());

    const dateCell = screen.getByText("2026-10-02").closest("td")!;
    expect(dateCell.className).toContain("whitespace-nowrap");
    expect(dateCell.className).not.toContain("whitespace-normal");
  });
});
