import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import type { DentalRecord } from "@/lib/api/dentalRecords";

const h = vi.hoisted(() => ({
  appts: [] as Appointment[],
  // No working days unless a test gives the dentist some.
  schedule: { days: [] as any[], unavailable: [] as any[] },
  // Which visits the patient has signed the consent for.
  consents: [] as { appointmentId: string; status: "signed" | "declined"; signedAt: string }[],
  // The dental records written so far.
  records: [] as DentalRecord[],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "dr-mike", name: "Dr. Mike Johnson", email: "dentist@ayagdental.com", role: "dentist", verified: true } }),
  api: vi.fn(async (path: string, init?: RequestInit) => {
    if (path.includes("consents=true")) return { consents: h.consents };
    if (path.includes("consent=true") && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      return { consent: { appointmentId: body.appointmentId, status: body.decision, signedAt: "2026-10-30T07:00:00Z", text: "", patientName: body.printedName } };
    }
    if (path.includes("dental-records?photos=true") && init?.method === "POST") return { photo: { id: "ph-1" } };
    if (path.includes("dental-records") && init?.method === "POST") return { record: { id: "rec-1" } };
    if (path === "/dental-records") return { records: h.records };
    if (path.startsWith("/dental-records?id=")) return { record: h.records.find(r => path.endsWith(r.id)) };
    if (path.includes("dental-records?photos=")) return { photos: [] };
    if (path.includes("consent=")) {
      return { consent: null, form: { patientName: "Juan Dela Cruz", procedure: "Oral", dentistName: "Dr. Mike Johnson", date: "September 25, 2026",
        text: "I, Juan Dela Cruz, give my consent.\n\nI may refuse at any time." } };
    }
    return { appointments: h.appts };
  }),
}));
// jsdom can't decode a picture; the shrunk photo is what the form keeps.
vi.mock("@/lib/shrinkPhoto", () => ({ shrinkPhoto: vi.fn(async (f: File) => `data:image/jpeg;base64,${f.name.replace(/\W/g, "")}`) }));
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
vi.mock("@/components/BookingCalendar", async () => {
  const React = await import("react");
  return {
    default: ({ onSelect }: any) =>
      React.createElement("button", { onClick: () => onSelect(new Date(2027, 2, 10)) }, "Pick Mar 10"),
  };
});

// The row's other actions sit behind ▾; a plain menu stands in for Radix's in jsdom.
vi.mock("@/components/ui/dropdown-menu", () => import("./plainDropdown"));
vi.mock("@/components/ui/popover", () => import("./plainPopover"));

import DentistAppointments from "@/pages/dentist/DentistAppointments";
import DentistRecords from "@/pages/dentist/DentistRecords";

/** Runs one of a row's actions from its ▾ menu. */
function pick(row: ReturnType<typeof within>, action: RegExp) {
  fireEvent.click(row.getByRole("button", { name: "More options" }));
  fireEvent.click(row.getByRole("menuitem", { name: action }));
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);
beforeEach(() => { h.schedule = { days: [], unavailable: [] }; h.consents = []; h.records = []; });

function apt(over: Partial<Appointment>): Appointment {
  return {
    id: "x", patientId: "p1", patientName: "Someone", contact: null, email: null,
    dentistId: "dr-mike", dentistName: "Dr. Mike Johnson", service: "Oral",
    date: "2026-09-25", time: "13:00", endTime: null, type: "online", status: "pending",
    reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient",
    createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z",
    ...over,
  };
}

describe("dentist actions wait for admin approval", () => {
  it("hides Start Consultation / Reschedule / Cancel on pending requests and says why", async () => {
    h.appts = [
      apt({ id: "p", patientName: "Allen Estrella", status: "pending" }),
      apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed", time: "14:00" }),
      apt({ id: "r", patientName: "Maria Santos", status: "rescheduled", time: "15:00" }),
    ];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);

    const pending = within((await screen.findByText("Allen Estrella")).closest("tr")!);
    for (const label of [/Start Consultation/, /Reschedule/, /^Cancel$/, /More options/]) {
      expect(pending.queryByRole("button", { name: label })).toBeNull();
    }
    expect(pending.getByLabelText("Awaiting admin approval")).toBeInTheDocument();

    for (const name of ["Juan Dela Cruz", "Maria Santos"]) {
      const approved = within(screen.getByText(name).closest("tr")!);
      fireEvent.click(approved.getByRole("button", { name: "More options" }));
      expect(approved.getAllByRole("menuitem").map(i => i.textContent?.trim())).toEqual([
        "Patient ConsentNot signed yet", "Start ConsultationNeeds the signed consent first", "Reschedule", "Cancel",
      ]);
      expect(approved.queryByLabelText("Awaiting admin approval")).toBeNull();
    }
  });
});

describe("what the reschedule dialog tells you about the move", () => {
  const FULL_WEEK = {
    days: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
    })),
    unavailable: [],
  };
  // An open dialog hides the rest of the page from queries, so scope to it.
  const dialog = () => within(document.querySelector("[role=dialog]") as HTMLElement);

  const openResched = async () => {
    h.schedule = FULL_WEEK;
    h.appts = [apt({
      id: "c", patientName: "Juan Dela Cruz", service: "Root Canal", status: "confirmed",
      date: "2026-09-30", time: "14:00", endTime: "14:45",
    })];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    pick(row, /Reschedule/);
    await waitFor(() => expect(document.querySelector("[role=dialog]")).not.toBeNull());
  };

  it("says which days it will even offer before the calendar greys the rest out", async () => {
    await openResched();
    const label = dialog().getByText("Your working hours:");
    expect(label.className).toMatch(/font-semibold/);
    expect(label.parentElement!.textContent).toMatch(/Sun 9:00 AM–5:00 PM/);
  });

  it("says which day the times belong to, and how many are left", async () => {
    await openResched();
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));

    const heading = await dialog().findByText(/^Times on /);
    expect(heading.textContent).toBe("Times on Wed, Mar 10 *");
    expect(heading.className).toMatch(/font-semibold/);
    expect(heading.className).toMatch(/text-foreground/);

    const count = dialog().getByText(/free$/);
    expect(count.className).toMatch(/bg-success/);
  });

  it("reads the move back before Save — where it is going, and where from", async () => {
    await openResched();
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    const slots = () => within(dialog().getByRole("group", { name: "Available time slots" }));
    await waitFor(() => expect(slots().getAllByRole("button").length).toBeGreaterThan(0));
    fireEvent.click(slots().getByRole("button", { name: "9:00 AM – 9:45 AM" }));

    const readback = (await dialog().findByText("March 10th, 2027")).closest("p")!;
    expect(readback.textContent).toBe(
      "Moving Juan Dela Cruz's Root Canal from September 30th, 2026 at 2:00 PM – 2:45 PM to March 10th, 2027 at 9:00 AM – 9:45 AM.",
    );
    expect(readback.className).toContain("bg-primary/5");
    // Where it is going carries more weight than where it came from.
    expect(within(readback).getByText("March 10th, 2027").className).toMatch(/font-semibold/);
    expect(within(readback).getByText("September 30th, 2026").className).not.toMatch(/font-semibold/);
  });

  it("says nothing about a move until a day and a time are both chosen", async () => {
    await openResched();
    expect(dialog().queryByText(/^Moving /)).toBeNull();

    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    await dialog().findByText(/^Times on /);
    expect(dialog().queryByText(/^Moving /)).toBeNull(); // the day alone isn't a move
  });
});

describe("a rescheduled visit keeps the length it already had", () => {
  const FULL_WEEK = {
    days: [0, 1, 2, 3, 4, 5, 6].map(dayOfWeek => ({
      dayOfWeek, start: "09:00", end: "17:00", lunchStart: null, lunchEnd: null, duration: 30, maxPatients: 20,
    })),
    unavailable: [],
  };
  const dialog = () => within(document.querySelector("[role=dialog]") as HTMLElement);
  const slotLabels = () =>
    within(dialog().getByRole("group", { name: "Available time slots" }))
      .getAllByRole("button").map(b => b.textContent);

  // A 45-minute visit: 2:00 PM to 2:45 PM.
  const open = async (extra: Appointment[] = [], date = "2026-09-30") => {
    h.schedule = FULL_WEEK;
    h.appts = [
      apt({ id: "c", patientName: "Juan Dela Cruz", service: "Root Canal", status: "confirmed",
            date, time: "14:00", endTime: "14:45" }),
      ...extra,
    ];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    pick(row, /Reschedule/);
    await waitFor(() => expect(document.querySelector("[role=dialog]")).not.toBeNull());
    fireEvent.click(dialog().getByRole("button", { name: "Pick Mar 10" }));
    await waitFor(() => expect(slotLabels().length).toBeGreaterThan(0));
  };

  it("offers only the slots the whole visit fits into, and says when it would end", async () => {
    await open();
    expect(slotLabels()[0]).toBe("9:00 AM – 9:45 AM");
    // The day ends at 5, so a 45-minute visit cannot start at 4:30.
    expect(slotLabels()).toContain("4:00 PM – 4:45 PM");
    expect(slotLabels().some(l => l!.startsWith("4:30 PM"))).toBe(false);
  });

  it("keeps clear of every slot an existing booking covers, not just its start", async () => {
    await open([apt({ id: "other", patientName: "Ana Reyes", status: "confirmed",
                      date: "2027-03-10", time: "10:00", endTime: "11:00" })]);
    // 9:30–10:15 and 10:30–11:15 both run into Ana's hour, so neither is on offer.
    for (const taken of ["9:30 AM – 10:15 AM", "10:00 AM – 10:45 AM", "10:30 AM – 11:15 AM"]) {
      expect(slotLabels()).not.toContain(taken);
    }
    expect(slotLabels()).toContain("11:00 AM – 11:45 AM");
  });

  it("does not let the appointment block its own slot when it stays on the same day", async () => {
    await open([], "2027-03-10"); // already on the day being picked
    expect(slotLabels()).toContain("2:00 PM – 2:45 PM");
  });
});

describe("the dentist's list puts the newest booking on top", () => {
  it("orders by when it was booked, not by the date it is for", async () => {
    h.appts = [
      apt({ id: "a", patientName: "Allen Estrella", date: "2026-10-02", createdAt: "2026-09-18T09:00:00Z" }),
      apt({ id: "b", patientName: "Pedro Reyes", date: "2027-03-10", createdAt: "2026-09-25T08:00:00Z" }),
      apt({ id: "c", patientName: "Maria Santos", date: "2026-09-26", createdAt: "2026-09-24T17:00:00Z" }),
    ];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    await screen.findByText("Pedro Reyes");

    const names = Array.from(document.querySelectorAll("tbody tr"))
      .map(r => (r as HTMLTableRowElement).cells[0].textContent);
    expect(names).toEqual(["Pedro Reyes", "Maria Santos", "Allen Estrella"]);
  });
});

describe("the consultation's dental chart", () => {
  it("saves the chart's codes and teeth with the record", async () => {
    const { api } = await import("@/contexts/AuthContext");
    h.appts = [apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed" })];
    h.consents = [{ appointmentId: "c", status: "signed", signedAt: "2026-09-25T05:00:00Z" }];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);

    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    await waitFor(() => {
      fireEvent.click(row.getByRole("button", { name: "More options" }));
      const item = row.getByRole("menuitem", { name: /Start Consultation/ });
      expect(item).not.toHaveAttribute("aria-disabled");
      fireEvent.click(item);
    });
    const form = within(await screen.findByRole("dialog"));
    const [procedure, diagnosis] = form.getAllByRole("textbox");
    fireEvent.change(procedure, { target: { value: "Restoration" } });
    fireEvent.change(diagnosis, { target: { value: "Caries" } });
    // A tooth opens its picker of the chart's codes.
    for (const t of [26, 16]) {
      fireEvent.click(form.getByRole("button", { name: `Tooth ${t}` }));
      fireEvent.click(within(screen.getByRole("dialog", { name: `Chart codes for tooth ${t}` })).getByRole("button", { name: "D: Decayed (caries)" }));
    }
    expect(form.getByRole("list", { name: "Chart codes by tooth" })).toHaveTextContent("16D26D");
    fireEvent.click(form.getByRole("button", { name: /Save Consultation/ }));

    await waitFor(() => {
      const saved = vi.mocked(api).mock.calls.find(([path, init]) => String(path).includes("dental-records") && init?.method === "POST");
      expect(JSON.parse(String(saved![1]!.body))).toMatchObject({
        toothNumber: "16, 26", diagnosis: "Caries", toothCodes: { 16: ["D"], 26: ["D"] }, treatments: [{ serviceName: "Restoration" }],
      });
    });
  });

  it("keeps the before and after photos with the record, labelled, once it's saved", async () => {
    const { api } = await import("@/contexts/AuthContext");
    h.appts = [apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed" })];
    h.consents = [{ appointmentId: "c", status: "signed", signedAt: "2026-09-25T05:00:00Z" }];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    await waitFor(() => {
      fireEvent.click(row.getByRole("button", { name: "More options" }));
      const item = row.getByRole("menuitem", { name: /Start Consultation/ });
      expect(item).not.toHaveAttribute("aria-disabled");
      fireEvent.click(item);
    });
    const form = within(await screen.findByRole("dialog"));
    const [procedure, diagnosis] = form.getAllByRole("textbox");
    fireEvent.change(procedure, { target: { value: "Veneers" } });
    fireEvent.change(diagnosis, { target: { value: "Stained front teeth" } });

    const file = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const add = (kind: "Before" | "After", name: string) => {
      fireEvent.click(form.getByRole("button", { name: `Add ${kind} Photo` }));
      fireEvent.change(file, { target: { files: [new File(["x"], name, { type: "image/jpeg" })] } });
    };
    add("Before", "front-before.jpg");
    expect(await form.findByRole("img", { name: "Before photo 1" })).toHaveAttribute("src", "data:image/jpeg;base64,frontbeforejpg");
    fireEvent.change(form.getByRole("combobox", { name: "Label for before photo 1" }), { target: { value: "Front" } });
    add("After", "front-after.jpg");
    await form.findByRole("img", { name: "After photo 1" });
    add("After", "oops.jpg");
    fireEvent.click(await form.findByRole("button", { name: "Remove after photo 2" }));
    expect(within(form.getByRole("group", { name: "After photos" })).getAllByRole("img")).toHaveLength(1);

    fireEvent.click(form.getByRole("button", { name: /Save Consultation/ }));
    await waitFor(() => {
      const sent = vi.mocked(api).mock.calls.filter(([path]) => String(path).includes("photos=true")).map(([, init]) => JSON.parse(String(init!.body)));
      expect(sent).toEqual([
        { recordId: "rec-1", kind: "before", label: "Front", image: "data:image/jpeg;base64,frontbeforejpg" },
        { recordId: "rec-1", kind: "after", label: null, image: "data:image/jpeg;base64,frontafterjpg" },
      ]);
    });
    await waitFor(() => expect(screen.queryByText("Dental Record Form")).toBeNull());
  });
});

describe("the patient's consent before the consultation", () => {
  beforeAll(() => {
    // jsdom draws nothing; the pad only needs to hand back a picture.
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,SIGNED");
  });

  it("keeps Start Consultation locked until the patient signs, then unlocks it", async () => {
    const { api } = await import("@/contexts/AuthContext");
    h.appts = [apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed" })];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);

    // Locked: it does nothing, and says why.
    fireEvent.click(row.getByRole("button", { name: "More options" }));
    const locked = row.getByRole("menuitem", { name: /Start Consultation/ });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(locked);
    expect(screen.queryByText("Dental Record Form")).toBeNull();

    // The patient reads it, ticks, prints their name and signs.
    fireEvent.click(row.getByRole("menuitem", { name: /Patient Consent/ }));
    const form = within(await screen.findByRole("dialog"));
    expect(await form.findByText("I, Juan Dela Cruz, give my consent.")).toBeInTheDocument();
    const sign = form.getByRole("button", { name: /Sign Consent/ });
    expect(sign).toBeDisabled();
    fireEvent.click(form.getByRole("checkbox", { name: /read and understood/ }));
    expect(form.getByLabelText("Patient's printed name")).toHaveValue("Juan Dela Cruz");
    expect(sign).toBeDisabled(); // not signed yet
    const pad = form.getByRole("img", { name: /Signature pad/ });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 60, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(pad, { clientX: 60, clientY: 30, pointerId: 1 });
    expect(sign).toBeEnabled();
    fireEvent.click(sign);

    await waitFor(() => {
      const sent = vi.mocked(api).mock.calls.find(([path, init]) => String(path).includes("consent=true") && init?.method === "POST");
      expect(JSON.parse(String(sent![1]!.body))).toEqual({
        appointmentId: "c", decision: "signed", printedName: "Juan Dela Cruz", signature: "data:image/png;base64,SIGNED",
      });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // Signed: the consultation opens.
    fireEvent.click(row.getByRole("button", { name: "More options" }));
    expect(row.getByRole("menuitem", { name: /Patient Consent/ })).toHaveTextContent("Signed");
    fireEvent.click(row.getByRole("menuitem", { name: /Start Consultation/ }));
    expect(await screen.findByText("Dental Record Form")).toBeInTheDocument();
  });

  it("keeps the signature on screen when Patient Declined is tapped and then taken back", async () => {
    h.appts = [apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed" })];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    pick(row, /Patient Consent/);
    const form = within(await screen.findByRole("dialog"));
    fireEvent.click(await form.findByRole("checkbox", { name: /read and understood/ }));
    const pad = form.getByRole("img", { name: /Signature pad/ });
    fireEvent.pointerDown(pad, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(pad, { clientX: 10, clientY: 10, pointerId: 1 });

    fireEvent.click(form.getByRole("button", { name: /Patient Declined/ }));
    fireEvent.click(form.getByRole("button", { name: "Back" }));
    // The same pad, still signed: Sign Consent sends what the patient can see.
    expect(form.getByRole("img", { name: /Signature pad/ })).toBe(pad);
    expect(form.queryByText(/Sign here with/)).toBeNull();
    expect(form.getByRole("button", { name: /Sign Consent/ })).toBeEnabled();
  });

  it("records a patient who declines, and the consultation stays locked", async () => {
    const { api } = await import("@/contexts/AuthContext");
    h.appts = [apt({ id: "c", patientName: "Juan Dela Cruz", status: "confirmed" })];
    render(<MemoryRouter><DentistAppointments /></MemoryRouter>);
    const row = within((await screen.findByText("Juan Dela Cruz")).closest("tr")!);
    pick(row, /Patient Consent/);
    const form = within(await screen.findByRole("dialog"));
    fireEvent.click(await form.findByRole("button", { name: /Patient Declined/ }));
    fireEvent.change(form.getByLabelText(/Why the patient declined/), { target: { value: "Wants a second opinion" } });
    fireEvent.click(form.getByRole("button", { name: /Record as Declined/ }));

    await waitFor(() => {
      const sent = vi.mocked(api).mock.calls.find(([path, init]) => String(path).includes("consent=true") && init?.method === "POST"
        && String(init.body).includes("declined"));
      expect(JSON.parse(String(sent![1]!.body))).toEqual({ appointmentId: "c", decision: "declined", reason: "Wants a second opinion" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(row.getByRole("button", { name: "More options" }));
    expect(row.getByRole("menuitem", { name: /Patient Consent/ })).toHaveTextContent("Patient declined");
    expect(row.getByRole("menuitem", { name: /Start Consultation/ })).toHaveAttribute("aria-disabled", "true");
  });
});

describe("checking back on a finished visit", () => {
  const record = (over: Partial<DentalRecord>): DentalRecord => ({
    id: "rec-9", appointmentId: "done", patientId: "p1", patientName: "Juan Dela Cruz",
    dentistId: "dr-mike", dentistName: "Dr. Mike Johnson", date: "2026-09-25",
    diagnosis: "Deep caries on 36", toothNumber: "36", treatmentNotes: "Filled with composite",
    nextVisit: null, createdAt: "2026-09-25T06:00:00Z",
    treatments: [{ id: "t1", serviceId: "s1", serviceName: "Restoration" }],
    prescriptions: [],
    ...over,
  });

  const openDetails = async (name: string) => {
    const row = within((await screen.findByText(name)).closest("tr")!);
    fireEvent.click(row.getByRole("button", { name: /View/ }));
    return within(await screen.findByRole("dialog"));
  };

  const app = () => (
    <MemoryRouter initialEntries={["/dentist/appointments"]}>
      <Routes>
        <Route path="/dentist/appointments" element={<DentistAppointments />} />
        <Route path="/dentist/records" element={<DentistRecords />} />
      </Routes>
    </MemoryRouter>
  );

  it("opens a completed appointment's dental record from its details", async () => {
    h.appts = [apt({ id: "done", patientName: "Juan Dela Cruz", status: "completed" })];
    h.records = [record({})];
    render(app());

    const details = await openDetails("Juan Dela Cruz");
    fireEvent.click(await details.findByRole("link", { name: /View Dental Record/ }));

    const view = within(await screen.findByRole("dialog", { name: "Dental Record Details" }));
    expect(await view.findByText("Deep caries on 36")).toBeInTheDocument();
    expect(view.getByText("Restoration")).toBeInTheDocument();
    expect(view.getByText("Filled with composite")).toBeInTheDocument();
  });

  it("offers to write the record when a completed visit has none, and nothing on one not done yet", async () => {
    h.appts = [
      apt({ id: "done", patientName: "Juan Dela Cruz", status: "completed" }),
      apt({ id: "next", patientName: "Maria Santos", status: "confirmed", time: "14:00" }),
    ];
    render(app());

    const done = await openDetails("Juan Dela Cruz");
    expect(await done.findByRole("link", { name: /Write Dental Record/ })).toBeInTheDocument();
    expect(done.queryByRole("link", { name: /View Dental Record/ })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const next = await openDetails("Maria Santos");
    expect(next.queryByRole("link", { name: /Dental Record/ })).toBeNull();
  });
});
