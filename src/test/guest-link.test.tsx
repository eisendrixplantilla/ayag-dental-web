import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Patient Records lists guests (walk-ins booked with no account) beside real accounts.
// Once a guest has signed up, staff link the guest's visits to that account.
const h = vi.hoisted(() => ({
  linked: [] as unknown[][],
  appointments: [] as Record<string, unknown>[],
  patients: [] as Record<string, unknown>[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin-1", name: "Front Desk", email: "admin@admin.com", role: "admin", verified: true } }),
  api: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/appointments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/appointments")>();
  return {
    ...actual,
    getAppointments: vi.fn(async () => h.appointments),
    linkGuestToAccount: vi.fn(async (name: string, contact: string | null, id: string, verification?: unknown) => {
      h.linked.push([name, contact, id, verification]);
      return 2;
    }),
  };
});
const account = (id: string, name: string, phone: string, email: string, gender: string | null = null, birthdate: string | null = null, age = 30) => ({
  id, name, phone, email, role: "patient", verified: true, age, status: "active", createdAt: "2026-09-01",
  firstName: null, middleName: null, lastName: null, address: null, birthdate, gender,
  bloodType: null, allergies: null, photoUrl: null, lastLogin: null,
});
vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return {
    ...actual,
    getPatients: vi.fn(async () => h.patients),
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

import AdminPatients from "@/pages/admin/AdminPatients";

const walkIn = (id: string) => ({
  id, patientId: null, patientName: "Rosa Mendoza", contact: "09171234567", email: null, age: 32, gender: "Female",
  dentistId: "dr-1", dentistName: "Dr. Mike Johnson", service: "Oral", date: "2026-09-20", time: "09:00",
  endTime: null, type: "walk-in", status: "completed", reason: null, remarks: null, rescheduleCount: 0,
  createdBy: "admin", createdAt: "2026-09-20T01:00:00Z", updatedAt: "2026-09-20T01:00:00Z",
});

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
const ACCOUNTS = [
  account("acct-1", "Ana Lopez", "0918 000 1111", "ana@example.com"),
  account("acct-2", "Rosa M. Mendoza", "0917-123-4567", "rosa@example.com", "Female", "1994-03-02"),
  account("acct-3", "Ben Cruz", "0919 999 0000", "ben@example.com", "Male"),
];

beforeEach(() => {
  h.linked = [];
  h.patients = [...ACCOUNTS];
  h.appointments = [walkIn("w-1"), walkIn("w-2")];
});
afterEach(cleanup);

const openLink = async () => {
  render(<MemoryRouter><AdminPatients /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "Link Rosa Mendoza (09171234567) to an account" }));
  return within(await screen.findByRole("dialog"));
};

describe("linking a guest to the account they made", () => {
  it("offers Link on guest rows only", async () => {
    render(<MemoryRouter><AdminPatients /></MemoryRouter>);
    await screen.findByText("Rosa Mendoza");
    expect(screen.getAllByRole("button", { name: /^Link .* to an account$/ })).toHaveLength(1);
  });

  it("puts the account with the same contact number first, marked Suggested", async () => {
    const dialog = await openLink();
    expect(dialog.getByText(/2 walk-in visits/)).toBeInTheDocument();
    const options = dialog.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Rosa M. Mendoza");
    expect(within(options[0]).getByText("Suggested")).toBeInTheDocument();
    expect(options.slice(1).some(o => within(o).queryByText("Suggested"))).toBe(false);
  });

  it("waits for staff to choose; the suggestion alone links nothing", async () => {
    const dialog = await openLink();
    expect(dialog.getByRole("button", { name: "Choose an account" })).toBeDisabled();
    expect(h.linked).toEqual([]);
  });

  it("searches accounts by name, phone or email", async () => {
    const dialog = await openLink();
    fireEvent.change(dialog.getByLabelText("Search patient accounts"), { target: { value: "ben@" } });
    expect(dialog.getAllByRole("option").map(o => o.textContent)).toEqual([expect.stringContaining("Ben Cruz")]);
    fireEvent.change(dialog.getByLabelText("Search patient accounts"), { target: { value: "nobody here" } });
    expect(dialog.getByText(/Ask the patient to sign up online first/)).toBeInTheDocument();
  });

  it("shows what the desk recorded for the guest", async () => {
    const dialog = await openLink();
    const guest = within(dialog.getByRole("region", { name: "Guest details" }));
    expect(guest.getByText("09171234567")).toBeInTheDocument();
    expect(guest.getByText("32")).toBeInTheDocument();
    expect(guest.getByText("Female")).toBeInTheDocument();
    expect(guest.getByText("2 walk-in visits")).toBeInTheDocument();
    expect(guest.getAllByText(/Oral · Dr\. Mike Johnson/)).toHaveLength(2);
  });

  it("lists each account's age, gender and birthdate", async () => {
    const dialog = await openLink();
    expect(dialog.getByRole("option", { name: /Rosa M\. Mendoza/ })).toHaveTextContent(/yrs · Female · Born 3\/2\/1994/);
    expect(dialog.getByRole("option", { name: /Ben Cruz/ })).toHaveTextContent(/30 yrs · Male/);
  });

  it("compares the guest with the chosen account, field by field", async () => {
    const dialog = await openLink();
    expect(dialog.queryByRole("region", { name: "Compare before linking" })).toBeNull();

    fireEvent.click(dialog.getByRole("option", { name: /Rosa M\. Mendoza/ }));
    const table = within(dialog.getByRole("region", { name: "Compare before linking" }));
    const verdict = (field: string) => table.getByRole("rowheader", { name: field }).closest("tr")!.lastElementChild!.textContent;
    expect(verdict("Name")).toBe("Check"); // middle initial added
    expect(verdict("Contact")).toBe("Match");
    expect(verdict("Gender")).toBe("Match");

    fireEvent.click(dialog.getByRole("option", { name: /Ben Cruz/ }));
    expect(verdict("Contact")).toBe("Different");
    expect(verdict("Gender")).toBe("Different");
  });
});

describe("the link only goes through once the patient is confirmed", () => {
  const linkButton = (dialog: ReturnType<typeof within>, name: string) => dialog.getByRole("button", { name: `Link to ${name}` });
  const confirmBox = (dialog: ReturnType<typeof within>) => dialog.queryByRole("region", { name: "Confirm identity" });

  it("links straight away when every detail matches", async () => {
    h.patients.push(account("acct-4", "Rosa Mendoza", "0917 123 4567", "rosa2@example.com", "Female", null, 32));
    const dialog = await openLink();
    fireEvent.click(dialog.getByRole("option", { name: /^Rosa Mendoza/ }));

    expect(confirmBox(dialog)).toBeNull();
    fireEvent.click(linkButton(dialog, "Rosa Mendoza"));
    await waitFor(() => expect(h.linked).toEqual([["Rosa Mendoza", "09171234567", "acct-4", undefined]]));
  });

  it("needs how it was confirmed, and the tick, when the details only partly match", async () => {
    const dialog = await openLink();
    fireEvent.click(dialog.getByRole("option", { name: /Rosa M\. Mendoza/ })); // name only "close"

    const box = within(confirmBox(dialog)!);
    expect(box.queryByLabelText(/Why is this still the same patient/)).toBeNull(); // nothing actually differs
    expect(linkButton(dialog, "Rosa M. Mendoza")).toBeDisabled();

    fireEvent.click(box.getByRole("radio", { name: "Checked a valid ID" }));
    expect(linkButton(dialog, "Rosa M. Mendoza")).toBeDisabled();
    fireEvent.click(box.getByRole("checkbox", { name: "I confirm this is the same person" }));
    expect(linkButton(dialog, "Rosa M. Mendoza")).toBeEnabled();

    fireEvent.click(linkButton(dialog, "Rosa M. Mendoza"));
    await waitFor(() => expect(h.linked).toEqual([
      ["Rosa Mendoza", "09171234567", "acct-2", { method: "id", confirmed: true, reason: undefined }],
    ]));
  });

  it("also needs a reason when a detail is different", async () => {
    h.patients.push(account("acct-5", "Rosa Mendoza", "0920 777 8888", "rosa3@example.com", "Female", null, 32));
    const dialog = await openLink();
    fireEvent.click(dialog.getByRole("option", { name: /^Rosa Mendoza/ })); // same name, different number

    const box = within(confirmBox(dialog)!);
    fireEvent.click(box.getByRole("radio", { name: "Patient logged in and showed their Profile" }));
    fireEvent.click(box.getByRole("checkbox", { name: "I confirm this is the same person" }));
    expect(linkButton(dialog, "Rosa Mendoza")).toBeDisabled();

    const reason = box.getByLabelText(/Why is this still the same patient/);
    fireEvent.change(reason, { target: { value: "new sim" } });
    expect(box.getByText("Please explain in a few more words.")).toBeInTheDocument();
    expect(linkButton(dialog, "Rosa Mendoza")).toBeDisabled();

    fireEvent.change(reason, { target: { value: "Changed her number; showed her account on her phone." } });
    expect(linkButton(dialog, "Rosa Mendoza")).toBeEnabled();
    fireEvent.click(linkButton(dialog, "Rosa Mendoza"));
    await waitFor(() => expect(h.linked).toEqual([["Rosa Mendoza", "09171234567", "acct-5", {
      method: "profile", confirmed: true, reason: "Changed her number; showed her account on her phone.",
    }]]));
  });

  it("refuses a clearly different person outright", async () => {
    const dialog = await openLink();
    fireEvent.click(dialog.getByRole("option", { name: /Ben Cruz/ }));

    expect(dialog.getByRole("alert")).toHaveTextContent(/Can't link: this looks like a different person/);
    expect(confirmBox(dialog)).toBeNull(); // no way to confirm past it
    expect(dialog.getByRole("button", { name: "Can't link" })).toBeDisabled();
  });

  it("starts the confirmation over when another account is chosen", async () => {
    h.patients.push(account("acct-5", "Rosa Mendoza", "0920 777 8888", "rosa3@example.com", "Female", null, 32));
    const dialog = await openLink();
    fireEvent.click(dialog.getByRole("option", { name: /Rosa M\. Mendoza/ }));
    fireEvent.click(within(confirmBox(dialog)!).getByRole("radio", { name: "Checked a valid ID" }));
    fireEvent.click(within(confirmBox(dialog)!).getByRole("checkbox", { name: "I confirm this is the same person" }));
    expect(linkButton(dialog, "Rosa M. Mendoza")).toBeEnabled();

    fireEvent.click(dialog.getByRole("option", { name: /^Rosa Mendoza/ }));
    expect(within(confirmBox(dialog)!).getByRole("checkbox", { name: "I confirm this is the same person" })).not.toBeChecked();
    expect(linkButton(dialog, "Rosa Mendoza")).toBeDisabled();
  });
});

describe("two guests who share a name", () => {
  const otherRosa = (id: string) => ({ ...walkIn(id), contact: "0999 000 1111", age: 60, date: "2026-10-01" });

  it("are listed apart, one row per name and number", async () => {
    h.appointments = [walkIn("w-1"), walkIn("w-2"), otherRosa("w-3")];
    render(<MemoryRouter><AdminPatients /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Link Rosa Mendoza (09171234567) to an account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link Rosa Mendoza (0999 000 1111) to an account" })).toBeInTheDocument();
  });

  it("show only their own visits and details when linking", async () => {
    h.appointments = [walkIn("w-1"), walkIn("w-2"), otherRosa("w-3")];
    render(<MemoryRouter><AdminPatients /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Link Rosa Mendoza (0999 000 1111) to an account" }));
    const guest = within(within(await screen.findByRole("dialog")).getByRole("region", { name: "Guest details" }));
    expect(guest.getByText("1 walk-in visit")).toBeInTheDocument();
    expect(guest.getByText("0999 000 1111")).toBeInTheDocument();
    expect(guest.getByText("60")).toBeInTheDocument();
  });
});
