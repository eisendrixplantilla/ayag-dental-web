import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Every Print button in the system builds a document and hands it to printReport.
// The pages run for real; only the network, Radix Select and the printer are replaced.
const h = vi.hoisted(() => ({
  patients: [] as any[],
  staff: [] as any[],
  records: [] as any[],
}));
const printed = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/lib/printReport", () => ({
  printReport: (doc: any) => { printed.calls.push(doc); return true; },
  ROWS_PER_PAGE: 20,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "su-1", name: "Super Administrator", email: "super@admin.com", role: "superadmin", verified: true },
  }),
  api: vi.fn(async () => ({})),
}));

vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return { ...actual, getPatients: vi.fn(async () => h.patients), getPatient: vi.fn(async () => h.patients[0]) };
});

vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getStaff: vi.fn(async () => h.staff), getDentistSchedule: vi.fn(async () => ({ days: [], unavailable: [] })) };
});

vi.mock("@/lib/api/dentalRecords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dentalRecords")>();
  return { ...actual, getDentalRecords: vi.fn(async () => h.records) };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

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
        items(children).map((i: any) =>
          React.createElement("option", { key: i.props.value, value: i.props.value }, i.props.children)),
      ),
    SelectTrigger: passthrough,
    SelectContent: passthrough,
    SelectItem: passthrough,
    SelectValue: () => null,
  };
});

import SuperAdminStaff from "@/pages/superadmin/SuperAdminStaff";
import AdminAccounts from "@/pages/admin/AdminAccounts";
import PatientRecords from "@/pages/patient/PatientRecords";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

beforeEach(() => {
  printed.calls = [];
  h.patients = [
    { id: "p1", name: "Maria Santos", email: "maria@example.com", status: "active", createdAt: "2026-09-20",
      phone: "0917", age: 30, appointmentsCount: 0, dentalRecordsCount: 0 },
    { id: "p2", name: "Pedro Reyes", email: "pedro@example.com", status: "inactive", createdAt: "2026-09-25",
      phone: "0918", age: 41, appointmentsCount: 2, dentalRecordsCount: 1 },
  ];
  h.staff = [
    { id: "s1", employeeId: "EMP-001", name: "Dr. Sarah Chen", email: "admin@admin.com", contact: "0912",
      role: "admin", status: "active", photoUrl: null, createdAt: "2026-01-04" },
    { id: "s2", employeeId: "EMP-003", name: "Dr. Mike Johnson", email: "dentist@ayagdental.com", contact: "0913",
      role: "dentist", status: "active", photoUrl: null, createdAt: "2026-01-05" },
  ];
  h.records = [
    {
      id: "r1", date: "2026-09-20", patientName: "Maria Santos", dentistName: "Dr. Mike Johnson",
      diagnosis: "Caries", treatmentNotes: "Filled", toothNumber: "12",
      treatments: [{ serviceId: "sv1", serviceName: "Restoration" }],
      prescriptions: [{ medicine: "Amoxicillin", dosage: "500mg", instructions: "Twice daily" }],
    },
  ];
});

const clickPrint = async (name: RegExp = /Print/) =>
  fireEvent.click(await screen.findByRole("button", { name }));
const doc = () => printed.calls[0];

describe("a list page prints the clinic's report document", () => {
  it("prints the staff list, with the filters it was narrowed by", async () => {
    render(<MemoryRouter><SuperAdminStaff /></MemoryRouter>);
    await screen.findByText("Dr. Mike Johnson");

    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));

    expect(doc().title).toBe("Staff Accounts Report");
    expect(doc().columns).toEqual([
      "Employee ID", "Full Name", "Email Address", "Contact Number", "Role", "Account Status",
    ]);
    expect(doc().rows).toEqual([
      ["EMP-001", "Dr. Sarah Chen", "admin@admin.com", "0912", "Admin", "active"],
      ["EMP-003", "Dr. Mike Johnson", "dentist@ayagdental.com", "0913", "Dentist", "active"],
    ]);
    // Who printed it and when are filled in for the page.
    expect(doc().preparedBy).toEqual({ name: "Super Administrator", role: "Super Admin" });
    expect(doc().generatedAt).toBeTruthy();
    expect(doc().filters).toContainEqual({ label: "Role", value: "All roles" });
  });

  it("prints only the rows left after filtering, not the whole list", async () => {
    render(<MemoryRouter><SuperAdminStaff /></MemoryRouter>);
    await screen.findByText("Dr. Mike Johnson");

    fireEvent.change(screen.getByPlaceholderText(/Search by Employee ID/), { target: { value: "mike" } });
    await waitFor(() => expect(screen.queryByText("Dr. Sarah Chen")).toBeNull());

    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    expect(doc().rows.map((r: string[]) => r[1])).toEqual(["Dr. Mike Johnson"]);
    expect(doc().filters).toContainEqual({ label: "Search", value: "mike" });
  });

  it("prints the patient accounts an admin sees, with their status spelled out", async () => {
    render(<MemoryRouter><AdminAccounts /></MemoryRouter>);
    await screen.findByText("Maria Santos");

    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));

    expect(doc().title).toBe("Patient Accounts Report");
    expect(doc().rows).toEqual([
      ["Maria Santos", "maria@example.com", "Active", "2026-09-20"],
      ["Pedro Reyes", "pedro@example.com", "Deactivated", "2026-09-25"],
    ]);
    expect(doc().filters).toContainEqual({ label: "Date Registered", value: "All dates" });
  });

  it("carries a date range onto the document", async () => {
    render(<MemoryRouter><AdminAccounts /></MemoryRouter>);
    await screen.findByText("Maria Santos");

    // The From/To boxes are plain date inputs, labelled only visually.
    const [from] = Array.from(document.querySelectorAll("input[type=date]")) as HTMLInputElement[];
    fireEvent.change(from, { target: { value: "2026-09-22" } });
    await waitFor(() => expect(screen.queryByText("Maria Santos")).toBeNull());

    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    expect(doc().rows.map((r: string[]) => r[0])).toEqual(["Pedro Reyes"]);
    expect(doc().filters).toContainEqual({ label: "Date Registered", value: "From 2026-09-22" });
  });
});

describe("a page that isn't one list prints a section per part of it", () => {
  it("prints a patient's records as visits, procedures and prescriptions", async () => {
    render(<MemoryRouter><PatientRecords /></MemoryRouter>);
    await screen.findByText(/Restoration/);

    await clickPrint();
    await waitFor(() => expect(printed.calls).toHaveLength(1));

    expect(doc().title).toBe("My Dental Records");
    expect(doc().tables.map((t: any) => t.heading)).toEqual(["Visit History", "Procedures", "Prescriptions"]);
    expect(doc().tables[0].rows[0]).toEqual(["Sep 20, 2026", "Restoration", "12", "Dr. Mike Johnson", "Filled"]);
    expect(doc().tables[2].rows[0]).toEqual([
      "Sep 20, 2026", "Amoxicillin", "500mg", "Dr. Mike Johnson", "Twice daily",
    ]);
    // Each section says what is missing in its own words.
    expect(doc().tables[1].emptyText).toBe("No procedures on record.");
  });
});
