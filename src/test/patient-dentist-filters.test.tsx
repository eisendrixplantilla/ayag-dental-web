import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import type { DentalRecord } from "@/lib/api/dentalRecords";
import type { Patient } from "@/lib/api/patients";

// The dentist's and the patient's own lists filter the way a report does: pick a
// column, then say what to look for. These pages hold their rows as cards or as
// several tables at once, so each list carries its own bar and its own count.
const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
  records: [] as DentalRecord[],
  patients: [] as Patient[],
  role: "patient" as string,
  name: "Maria Santos" as string,
  // No working days unless a test gives the dentist some.
  schedule: { days: [] as any[], unavailable: [] as any[] },
}));
const printed = vi.hoisted(() => ({ calls: [] as any[] }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", name: h.name, email: "u@example.com", role: h.role, verified: true } }),
  api: vi.fn(async () => ({})),
}));
vi.mock("@/lib/api/appointments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/appointments")>();
  return { ...actual, getAppointments: vi.fn(async () => h.appts), getBookedSlots: vi.fn(async () => []) };
});
vi.mock("@/lib/api/dentalRecords", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/dentalRecords")>();
  return { ...actual, getDentalRecords: vi.fn(async () => h.records) };
});
vi.mock("@/lib/api/staff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/staff")>();
  return { ...actual, getDentistSchedule: vi.fn(async () => h.schedule) };
});
// The calendar can't be driven in jsdom; a button that picks one day can.
vi.mock("@/components/ui/calendar", async () => {
  const React = await import("react");
  return {
    Calendar: ({ onSelect }: any) =>
      React.createElement("button", { onClick: () => onSelect(new Date(2027, 2, 10)) }, "Pick Mar 10"),
  };
});
vi.mock("@/lib/api/patients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/patients")>();
  return { ...actual, getPatients: vi.fn(async () => h.patients) };
});
vi.mock("@/lib/printReport", () => ({
  printReport: (doc: any) => { printed.calls.push(doc); return true; },
  ROWS_PER_PAGE: 20,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

// Radix's Select can't be driven in jsdom; a native <select> with the same items can.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  const items = (node: any): any[] =>
    React.Children.toArray(node).flatMap((c: any) =>
      c?.props?.value !== undefined ? [c] : c?.props?.children ? items(c.props.children) : []);
  const passthrough = ({ children }: any) => children ?? null;
  return {
    Select: ({ value, onValueChange, children }: any) =>
      React.createElement(
        "select",
        {
          "aria-label": (React.Children.toArray(children) as any[])
            .find(c => c?.props?.["aria-label"])?.props["aria-label"],
          value,
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

import PatientRecords from "@/pages/patient/PatientRecords";
import PatientAppointments from "@/pages/patient/PatientAppointments";
import DentistPatientHistory from "@/pages/dentist/DentistPatientHistory";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "x", patientId: "p1", patientName: "Maria Santos", contact: null, email: null,
    dentistId: "d1", dentistName: "Dr. Mike Johnson", service: "Oral Prophylaxis",
    date: "2026-09-25", time: "13:00", endTime: null, type: "online", status: "confirmed",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  };
}

function rec(over: Partial<DentalRecord>): DentalRecord {
  return {
    id: "r", appointmentId: "x", patientId: "p1", patientName: "Maria Santos",
    dentistId: "d1", dentistName: "Dr. Mike Johnson", date: "2026-09-20",
    diagnosis: "Mild caries", toothNumber: "14", treatmentNotes: "Cleaned and sealed",
    nextVisit: null, createdAt: "2026-09-20T02:00:00Z",
    treatments: [{ id: "t1", serviceId: "s1", serviceName: "Oral Prophylaxis" }],
    prescriptions: [{ id: "rx1", medicine: "Amoxicillin", dosage: "500mg", instructions: "After meals" }],
    ...over,
  };
}

const fields = () => screen.getAllByLabelText("Filter by field") as HTMLSelectElement[];
const optionsOf = (el: HTMLElement) => within(el).getAllByRole("option").map(o => o.textContent);

beforeEach(() => {
  printed.calls = [];
  h.role = "patient";
  h.name = "Maria Santos";
  h.appts = [];
  h.records = [];
  h.patients = [];
  h.schedule = { days: [], unavailable: [] };
});

describe("a patient narrows their own records", () => {
  beforeEach(() => {
    h.records = [
      rec({ id: "r1", date: "2026-09-20", dentistName: "Dr. Mike Johnson", treatmentNotes: "Cleaned and sealed" }),
      rec({
        id: "r2", date: "2026-09-24", dentistName: "Dr. Sarah Chen", diagnosis: "Gum inflammation",
        toothNumber: "22", treatmentNotes: "Extraction done",
        treatments: [{ id: "t2", serviceId: "s2", serviceName: "Tooth Extraction" }],
        prescriptions: [{ id: "rx2", medicine: "Mefenamic", dosage: "250mg", instructions: "For pain" }],
      }),
    ];
  });

  it("offers the visit columns, and narrows the visits to one dentist", async () => {
    render(<MemoryRouter><PatientRecords /></MemoryRouter>);
    await screen.findByText("Cleaned and sealed");
    expect(optionsOf(fields()[0]))
      .toEqual(["All fields", "Date", "Procedures", "Tooth", "Dentist", "Notes"]);
    expect(screen.getByText("2 record(s)")).toBeInTheDocument();

    fireEvent.change(fields()[0], { target: { value: "3" } }); // Dentist
    const picker = await screen.findByLabelText("Filter by Dentist");
    expect(optionsOf(picker)).toEqual(["Any dentist", "Dr. Mike Johnson", "Dr. Sarah Chen"]);
    fireEvent.change(picker, { target: { value: "Dr. Sarah Chen" } });

    await waitFor(() => expect(screen.queryByText("Cleaned and sealed")).toBeNull());
    expect(screen.getByText("Extraction done")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 record(s)")).toBeInTheDocument();
  });

  it("starts the filter over on the tab that holds different columns", async () => {
    render(<MemoryRouter><PatientRecords /></MemoryRouter>);
    await screen.findByText("Cleaned and sealed");

    fireEvent.change(fields()[0], { target: { value: "3" } }); // Dentist
    fireEvent.change(await screen.findByLabelText("Filter by Dentist"), { target: { value: "Dr. Sarah Chen" } });
    await waitFor(() => expect(screen.getByText("1 of 2 record(s)")).toBeInTheDocument());

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Prescriptions/ }));
    await waitFor(() => expect(screen.getByText("2 prescription(s)")).toBeInTheDocument());
    expect(fields()[0].value).toBe("all");
    expect(optionsOf(fields()[0]))
      .toEqual(["All fields", "Date", "Medication", "Dosage", "Prescribed By", "Instructions"]);

    fireEvent.change(fields()[0], { target: { value: "1" } }); // Medication
    fireEvent.change(await screen.findByLabelText("Filter by Medication"), { target: { value: "Mefenamic" } });
    await waitFor(() => expect(screen.queryByText("500mg")).toBeNull());
    expect(screen.getByText("250mg")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 prescription(s)")).toBeInTheDocument();
  });

  it("prints only what is left, and says what was filtered", async () => {
    render(<MemoryRouter><PatientRecords /></MemoryRouter>);
    await screen.findByText("Cleaned and sealed");

    fireEvent.change(fields()[0], { target: { value: "0" } }); // Date — a range, not a list
    await waitFor(() => expect(screen.getByLabelText("From date")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("From date"), { target: { value: "2026-09-22" } });
    await waitFor(() => expect(screen.getByText("1 of 2 record(s)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    const doc = printed.calls[0];
    expect(doc.tables[0].rows.map((r: string[]) => r[0])).toEqual(["2026-09-24"]);
    // The other tabs weren't filtered, so they print whole.
    expect(doc.tables[2].rows).toHaveLength(2);
    expect(doc.filters).toContainEqual({
      label: "Filtered By", value: "Visit History — Date: from 2026-09-22",
    });
  });
});

describe("a patient narrows their own appointments", () => {
  beforeEach(() => {
    h.appts = [
      apt({ id: "a1", service: "Oral Prophylaxis", date: "2027-01-10", status: "confirmed" }),
      apt({ id: "a2", service: "Tooth Extraction", date: "2027-02-10", status: "pending" }),
      apt({ id: "a3", service: "Veeners", date: "2026-01-10", status: "completed" }),
    ];
  });

  it("narrows the upcoming list by a column, and counts what is left", async () => {
    render(<MemoryRouter><PatientAppointments /></MemoryRouter>);
    await screen.findByText("Oral Prophylaxis");
    expect(optionsOf(fields()[0]))
      .toEqual(["All fields", "Reference", "Service", "Dentist", "Date", "Time", "Status"]);
    expect(screen.getByText("2 appointment(s)")).toBeInTheDocument();

    fireEvent.change(fields()[0], { target: { value: "5" } }); // Status
    fireEvent.change(await screen.findByLabelText("Filter by Status"), { target: { value: "pending" } });

    await waitFor(() => expect(screen.queryByText("Oral Prophylaxis")).toBeNull());
    expect(screen.getByText("Tooth Extraction")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 appointment(s)")).toBeInTheDocument();
  });

  it("prints the upcoming and past sections as they were narrowed", async () => {
    render(<MemoryRouter><PatientAppointments /></MemoryRouter>);
    await screen.findByText("Oral Prophylaxis");

    fireEvent.change(fields()[0], { target: { value: "1" } }); // Service
    fireEvent.change(await screen.findByLabelText("Filter by Service"), { target: { value: "Tooth Extraction" } });
    await waitFor(() => expect(screen.getByText("1 of 2 appointment(s)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    const doc = printed.calls[0];
    expect(doc.tables[0].rows.map((r: string[]) => r[1])).toEqual(["Tooth Extraction"]);
    expect(doc.tables[1].rows).toHaveLength(0); // the past visit was a different service
    expect(doc.filters).toContainEqual({ label: "Filtered By", value: "Service: Tooth Extraction" });
  });
});

describe("a dentist narrows one section of a patient's history", () => {
  beforeEach(() => {
    h.role = "dentist";
    h.name = "Dr. Mike Johnson";
    h.patients = [{
      id: "p1", name: "Maria Santos", email: "maria@example.com", status: "active",
      createdAt: "2026-09-01", phone: "0917", age: 30, gender: "female", address: null,
      bloodType: null, allergies: null, appointmentsCount: 2, dentalRecordsCount: 2,
    } as Patient];
    h.appts = [
      apt({ id: "a1", service: "Oral Prophylaxis", date: "2026-09-20", status: "completed" }),
      apt({ id: "a2", service: "Tooth Extraction", date: "2026-09-24", status: "cancelled" }),
    ];
    h.records = [
      rec({ id: "r1", date: "2026-09-20", diagnosis: "Mild caries" }),
      rec({ id: "r2", date: "2026-09-24", diagnosis: "Gum inflammation" }),
    ];
  });

  const section = async (heading: string) =>
    within((await screen.findByText(heading)).closest("div.bg-card") as HTMLElement);

  it("gives each of the four tables its own bar, and leaves the others alone", async () => {
    render(<MemoryRouter><DentistPatientHistory /></MemoryRouter>);
    const appts = await section("Appointment History");
    const records = await section("Previous Dental Records");

    expect(optionsOf(appts.getByLabelText("Filter by field")))
      .toEqual(["All fields", "Date", "Time", "Service", "Type", "Status"]);
    expect(optionsOf(records.getByLabelText("Filter by field")))
      .toEqual(["All fields", "Date", "Procedures", "Diagnosis", "Treatment Notes"]);
    expect(appts.getByText("2 appointment(s)")).toBeInTheDocument();
    expect(records.getByText("2 record(s)")).toBeInTheDocument();

    fireEvent.change(appts.getByLabelText("Filter by field"), { target: { value: "4" } }); // Status
    fireEvent.change(await appts.findByLabelText("Filter by Status"), { target: { value: "cancelled" } });

    await waitFor(() => expect(appts.getByText("1 of 2 appointment(s)")).toBeInTheDocument());
    expect(appts.queryByText("Oral Prophylaxis")).toBeNull();
    // Narrowing one section says nothing about the next one.
    expect(records.getByText("2 record(s)")).toBeInTheDocument();
    expect(records.getByText("Mild caries")).toBeInTheDocument();
  });

  it("prints each section as it was narrowed, and names which one", async () => {
    render(<MemoryRouter><DentistPatientHistory /></MemoryRouter>);
    const records = await section("Previous Dental Records");

    fireEvent.change(records.getByLabelText("Filter by field"), { target: { value: "2" } }); // Diagnosis
    fireEvent.change(await records.findByLabelText("Filter by Diagnosis"), { target: { value: "Gum inflammation" } });
    await waitFor(() => expect(records.getByText("1 of 2 record(s)")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Print/ }));
    await waitFor(() => expect(printed.calls).toHaveLength(1));
    const doc = printed.calls[0];
    expect(doc.tables[0].rows).toHaveLength(2); // appointments untouched
    expect(doc.tables[1].rows.map((r: string[]) => r[2])).toEqual(["Gum inflammation"]);
    expect(doc.filters).toContainEqual({
      label: "Dental records filtered by", value: "Diagnosis: Gum inflammation",
    });
  });
});

describe("what the reschedule dialog tells a patient about the move", () => {
  const FULL_WEEK = {
    days: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
    })),
    unavailable: [],
  };
  // An open dialog hides the rest of the page from queries, so scope to it.
  const dialog = () => within(document.querySelector("[role=dialog]") as HTMLElement);

  const openReschedule = async () => {
    h.schedule = FULL_WEEK;
    h.appts = [apt({
      id: "a1", service: "Root Canal", dentistName: "Dr. Mike Johnson",
      date: "2027-01-10", time: "14:00", endTime: "14:45", status: "confirmed",
    })];
    render(<MemoryRouter><PatientAppointments /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: /Reschedule/ }));
    await waitFor(() => expect(document.querySelector("[role=dialog]")).not.toBeNull());
    await dialog().findByText("Dr. Mike Johnson's hours:");
  };

  it("says which days the dentist works before the calendar greys the rest out", async () => {
    await openReschedule();
    const label = dialog().getByText("Dr. Mike Johnson's hours:");
    expect(label.className).toMatch(/font-semibold/);
    expect(label.parentElement!.textContent).toMatch(/Sun 9:00 AM–5:00 PM/);
  });

  it("says which day the times belong to, and how many are left", async () => {
    await openReschedule();
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));

    const heading = await dialog().findByText(/^Times on /);
    expect(heading.textContent).toBe("Times on Wed, Mar 10");
    expect(heading.className).toMatch(/font-semibold/);
    expect(heading.className).toMatch(/text-foreground/);

    const count = dialog().getByText(/free$/);
    expect(count.className).toMatch(/bg-success/);
  });

  it("reads the move back before Confirm — where it is going, and where from", async () => {
    await openReschedule();
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    const slots = () => within(dialog().getByRole("group", { name: "Available time slots" }));
    await waitFor(() => expect(slots().getAllByRole("button").length).toBeGreaterThan(0));
    fireEvent.click(slots().getByRole("button", { name: "9:00 AM" }));

    const readback = (await dialog().findByText("March 10th, 2027")).closest("p")!;
    expect(readback.textContent).toBe(
      "Moving your Root Canal from January 10th, 2027 at 2:00 PM – 2:45 PM to March 10th, 2027 at 9:00 AM.",
    );
    expect(readback.className).toContain("bg-primary/5");
    // Where it is going carries more weight than where it came from.
    expect(within(readback).getByText("March 10th, 2027").className).toMatch(/font-semibold/);
    expect(within(readback).getByText("January 10th, 2027").className).not.toMatch(/font-semibold/);

    // The rule that the move needs approving is still said, alongside it.
    expect(dialog().getByText(/goes back to/).textContent).toMatch(/Pending.*requires admin approval/);
  });

  it("says nothing about a move until a day and a time are both chosen", async () => {
    await openReschedule();
    expect(dialog().queryByText(/^Moving your/)).toBeNull();

    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    await dialog().findByText(/^Times on /);
    expect(dialog().queryByText(/^Moving your/)).toBeNull(); // the day alone isn't a move
  });
});
