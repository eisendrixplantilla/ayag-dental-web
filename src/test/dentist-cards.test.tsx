import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DentistProfile } from "@/lib/api/booking";
import type { Appointment } from "@/lib/api/appointments";

const h = vi.hoisted(() => ({ appointments: [] as Partial<Appointment>[], asked: [] as unknown[] }));

vi.mock("@/lib/api/booking", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/booking")>()),
  getDentistProfiles: vi.fn(async () => profiles),
  getMonthAvailability: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/staff", () => ({ getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: [] })) }));
vi.mock("@/lib/api/appointments", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/appointments")>()),
  getAppointments: vi.fn(async (filters: unknown) => { h.asked.push(filters); return h.appointments; }),
}));

import DentistCards from "@/components/DentistCards";

const dentist = (id: string, name: string, extra: Partial<DentistProfile> = {}): DentistProfile => ({
  id, name, photoUrl: null, services: null, days: [{ dayOfWeek: 1, start: "09:00", end: "17:00" }], limits: [], hours: [], ...extra,
});
const profiles = [
  dentist("dr-a", "Aerhol Gocalin", { unavailable: [{ date: "2099-10-26", reason: "For Testing" }] }),
  dentist("dr-b", "Abaristo Matthew"),
];

const booking = (dentistId: string, status: Appointment["status"], createdAt: string): Partial<Appointment> =>
  ({ dentistId, dentistName: null, status, createdAt, date: "2026-10-01", time: "09:00" });

const open = (recentFor?: string) => render(
  <TooltipProvider>
    <DentistCards open onOpenChange={() => {}} services={[]} onChoose={() => {}} recentFor={recentFor} />
  </TooltipProvider>,
);
const cardNames = () => screen.getAllByRole("button", { name: "Choose this dentist" })
  .map((b) => b.closest("div.rounded-lg")!.querySelector("p")!.textContent);

afterEach(() => { cleanup(); h.appointments = []; h.asked = []; });

describe("the dentist cards", () => {
  it("don't list the days a dentist is away: those read as days off on the calendar", async () => {
    open();
    await screen.findByText("Aerhol Gocalin");
    expect(screen.queryByText(/Unavailable/)).toBeNull();
    expect(screen.queryByText("Mon, Oct 26")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("tag the patient's latest dentist as Recent and list them first", async () => {
    h.appointments = [
      booking("dr-a", "completed", "2026-09-01T00:00:00Z"),
      booking("dr-b", "pending", "2026-10-01T00:00:00Z"),
      booking("dr-a", "cancelled", "2026-10-10T00:00:00Z"), // called off, so it doesn't count
    ];
    open("patient-1");
    const badge = await screen.findByText("Recent");
    expect(h.asked).toEqual([{ patientId: "patient-1" }]);
    expect(within(badge.closest("div.rounded-lg") as HTMLElement).getByText("Abaristo Matthew")).toBeInTheDocument();
    expect(cardNames()).toEqual(["Abaristo Matthew", "Aerhol Gocalin"]);
    expect(document.querySelectorAll("[data-recent]")).toHaveLength(1);
  });

  it("ask for the signed-in patient's own bookings on the patient page", async () => {
    h.appointments = [booking("dr-a", "confirmed", "2026-10-01T00:00:00Z")];
    open("self");
    await screen.findByText("Recent");
    expect(h.asked).toEqual([{}]);
  });

  it("tag no one without a patient", async () => {
    open();
    await screen.findByText("Aerhol Gocalin");
    await waitFor(() => expect(cardNames()).toEqual(["Aerhol Gocalin", "Abaristo Matthew"]));
    expect(screen.queryByText("Recent")).toBeNull();
    expect(h.asked).toEqual([]);
  });
});
