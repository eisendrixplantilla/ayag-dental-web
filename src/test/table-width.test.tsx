import { render, screen, waitFor, cleanup } from "@testing-library/react";
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

  it("still keeps the short columns on one line, where a wrap would read as two rows", async () => {
    h.appts = [appointment()];
    render(<MemoryRouter><AdminOnlineAppointments /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("2026-10-02")).toBeInTheDocument());

    const dateCell = screen.getByText("2026-10-02").closest("td")!;
    expect(dateCell.className).toContain("whitespace-nowrap");
    expect(dateCell.className).not.toContain("whitespace-normal");
  });
});
