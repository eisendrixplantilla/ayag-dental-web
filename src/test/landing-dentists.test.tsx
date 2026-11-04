import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// The home page's "Our Dentists" cards: what each dentist offers and how many a day, as a
// table of their working days. Numbers a service still holds for a day the dentist no
// longer works must not show up as a day they're in.
vi.mock("@/lib/api/settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/settings")>()),
  getLetterhead: vi.fn(async () => ({ name: "Ayag Dental Clinic", phone: "", email: "", address: "", hours: [] })),
}));
vi.mock("@/lib/api/booking", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/booking")>()),
  getDentistProfiles: vi.fn(async () => [{
    id: "dr-1", name: "Aerhol Gocalin", photoUrl: null,
    services: ["Restoration", "TMJ"],
    days: [1, 3, 5].map((dayOfWeek) => ({ dayOfWeek, start: "09:00", end: "17:00" })),
    limits: [],
    hours: [
      // Mon is 0 (not done that day); Sun and Tue are left over from an older week.
      { service: "Restoration", days: [0, 2, 3, 5], start: null, end: null, dayLimits: { "0": 2, "2": 3, "3": 2, "5": 4 } },
      { service: "TMJ", days: [3, 5], start: null, end: null, dayLimits: { "3": 6, "5": 5 } },
    ],
  }]),
}));

import Landing from "@/pages/Landing";

beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    observe() {} unobserve() {} disconnect() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
});
afterEach(cleanup);

describe("the dentists on the home page", () => {
  it("show each service's daily numbers on the days the dentist works, in a table", async () => {
    render(<MemoryRouter><Landing /></MemoryRouter>);
    const card = (await screen.findByRole("heading", { name: "Aerhol Gocalin" })).closest(".shadow-card") as HTMLElement;
    const table = within(card).getByRole("table");

    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Service", "Mon", "Wed", "Fri"]);
    const row = (name: string) => within(table).getByRole("rowheader", { name }).closest("tr")!;
    expect([...row("Restoration").querySelectorAll("td")].map((c) => c.textContent)).toEqual(["—", "2", "4"]);
    expect([...row("TMJ").querySelectorAll("td")].map((c) => c.textContent)).toEqual(["—", "6", "5"]);
    // The old run-on lines are gone, and so are the days he no longer works.
    expect(card.textContent).not.toMatch(/\(max|Sun|Tue/);
  });
});
