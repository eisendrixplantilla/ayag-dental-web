import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/appointments.ts handler. The database is a small in-memory table
// that understands the handful of queries the handler makes; the session check and
// the outbound email call are faked.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  rows: [] as Row[],
  session: { sub: "admin-1", email: "admin@admin.com", role: "admin" } as { sub: string; email: string; role: string },
  accounts: [] as Row[],
  /** dentist_service_limits rows: { dentist_id, service_name, daily_limit }. */
  limits: [] as Row[],
  /** dentist_services rows: { dentist_id, service_name }. */
  offered: [] as Row[],
  /** dentist_service_hours rows: { dentist_id, service_name, days, start_time, end_time }. */
  hours: [] as Row[],
  /** Whether overdue pending requests are closed. Off for the older tests, whose
   * pending requests sit on dates that are past by now. */
  expire: false,
  n: 0,
}));

const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

const sameDentist = (r: Row, id: string | null, name: string | null) =>
  (id !== null && r.dentist_id === id) || (name !== null && r.dentist_name === name);

// The handler asks for the dentist's bookings that day and compares the spans itself,
// so the fake only has to hand back the rows.
const onThatDay = (date: string, statuses: string[], dentistId: string | null, dentistName: string | null, excludeId: string | null) =>
  h.rows.filter(r => r.date === date && statuses.includes(r.status)
    && sameDentist(r, dentistId, dentistName) && r.id !== excludeId);

vi.mock("../../api/_lib/db.js", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");
    if (text.includes("slot-clash")) {
      const [date, statuses, dentistId, dentistName, excludeId] = v;
      return onThatDay(date, statuses, dentistId, dentistName, excludeId)
        .map(r => ({ time: r.time, end_time: r.end_time }));
    }
    if (text.includes("booked-slots")) {
      const [date, statuses, dentistId, dentistName, excludeId] = v;
      return onThatDay(date, statuses, dentistId, dentistName, excludeId)
        .map(r => ({ time: r.time, end_time: r.end_time }));
    }
    if (text.includes("patient-same-day")) {
      const [date, statuses, patientId, , patientName, digits, excludeId] = v;
      return h.rows.filter(r => r.date === date && statuses.includes(r.status) && r.id !== excludeId
        && ((patientId !== null && r.patient_id === patientId)
          || (patientId === null && r.patient_id === null && r.patient_name === patientName && onlyDigits(r.contact) === digits)))
        .map(r => ({ service: r.service, time: r.time }));
    }
    if (text.includes("guest-columns")) return [];
    if (text.includes("booking-limits-table") || text.includes("calendar-style-column") || text.includes("dentist-services-table")
      || text.includes("service-hours-table") || text.includes("service-day-limits-column")) return [];
    if (text.includes("service-hours")) return h.hours.filter(r => r.dentist_id === v[0]);
    if (text.includes("offered-services")) return h.offered.filter(o => o.dentist_id === v[0]);
    if (text.includes("dentists-by-name")) return [];
    if (text.includes("service-limits")) return h.limits.filter(l => l.dentist_id === v[0]);
    if (text.includes("day-service-counts")) {
      const [date, statuses, dentistId, dentistName, excludeId] = v;
      return onThatDay(date, statuses, dentistId, dentistName, excludeId).map(r => ({ service: r.service }));
    }
    if (text.includes("month-availability")) {
      const [from, to, statuses, dentistId, dentistName, excludeId] = v;
      return h.rows.filter(r => r.date >= from && r.date <= to && statuses.includes(r.status)
        && sameDentist(r, dentistId, dentistName) && r.id !== excludeId);
    }
    if (text.includes("link-target")) return h.accounts.filter(a => a.id === v[0]);
    if (text.includes("link-guest-details")) {
      const [name, digits] = v;
      return h.rows.filter(r => r.patient_id === null && r.patient_name === name && onlyDigits(r.contact) === digits)
        .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    }
    if (text.includes("link-guest")) {
      const [patientId, name, digits] = v;
      const moved = h.rows.filter(r => r.patient_id === null && r.patient_name === name && onlyDigits(r.contact) === digits);
      moved.forEach(r => { r.patient_id = patientId; });
      return moved.map(r => ({ id: r.id }));
    }
    if (text.includes("INSERT INTO appointments")) {
      const [patient_id, patient_name, contact, email, age, gender, dentist_id, dentist_name, service, date, time, end_time, type, status, reason, created_by] = v;
      const row = { id: `new-${++h.n}`, patient_id, patient_name, contact, email, age, gender, dentist_id, dentist_name, service, date, time, type,
        status, reason, remarks: null, reschedule_count: 0, created_by, end_time,
        created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z" };
      h.rows.push(row);
      return [row];
    }
    if (text.includes("expire-pending")) {
      if (!h.expire) return [];
      const [reason, today, , now] = v;
      for (const r of h.rows) {
        if (r.status === "pending" && (r.date < today || (r.date === today && r.time <= now))) {
          Object.assign(r, { status: "rejected", reason });
        }
      }
      return [];
    }
    if (text.includes("UPDATE appointments")) {
      const [status, date, time, end_time, reason, remarks, dentist_id, dentist_name, inc, id] = v;
      const row = h.rows.find(r => r.id === id)!;
      Object.assign(row, Object.fromEntries(Object.entries({ status, date, time, end_time, reason, remarks, dentist_id, dentist_name })
        .filter(([, val]) => val !== null)));
      row.reschedule_count += inc;
      return [{ ...row }];
    }
    // Copies, like a real database: the handler compares the row before and after.
    if (text.includes("SELECT * FROM appointments WHERE id")) return h.rows.filter(r => r.id === v[0]).map(r => ({ ...r }));
    throw new Error(`unexpected query: ${text}`);
  }),
}));
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => h.session }));
const sendAppointmentEmail = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/email.js", () => ({ sendAppointmentEmail }));

import handler from "../../api/appointments";

type Res = { code?: number; body?: any };
function call(method: string, opts: { query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<Res> {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query: opts.query ?? {}, body: opts.body }, res).then(() => res);
}
const patch = (id: string, body: Record<string, unknown>) => call("PATCH", { query: { id }, body });

const DR = "dr-mike";
const row = (over: Row = {}): Row => ({
  id: "apt-1", patient_id: "p1", patient_name: "Allen Estrella", contact: null, email: "allen@example.com",
  dentist_id: DR, dentist_name: "Dr. Mike Johnson", service: "Oral", date: "2026-09-25", time: "13:00",
  end_time: null, type: "online", status: "pending", reason: null, remarks: null, reschedule_count: 0,
  created_by: "patient", created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z",
  ...over,
});
const booking = { patientName: "Maria", dentistId: DR, dentistName: "Dr. Mike Johnson", service: "Oral", type: "online" };

beforeEach(() => {
  h.rows = [];
  h.limits = [];
  h.offered = [];
  h.hours = [];
  h.expire = false;
  h.n = 0;
  h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
  sendAppointmentEmail.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("approval email", () => {
  beforeEach(() => { h.rows = [row()]; });

  it("emails the patient on approval and says so", async () => {
    const res = await patch("apt-1", { status: "confirmed" });
    expect(res.code).toBe(200);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.appointment.status).toBe("confirmed");
    expect(sendAppointmentEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: "allen@example.com", status: "confirmed", patientName: "Allen Estrella", time: "13:00",
    }));
  });

  it("still saves the approval if the email fails, but reports emailSent: false", async () => {
    sendAppointmentEmail.mockRejectedValue(new Error("EmailJS send failed: 400"));
    const res = await patch("apt-1", { status: "confirmed" });
    expect(res.code).toBe(200);
    expect(res.body.appointment.status).toBe("confirmed");
    expect(res.body.emailSent).toBe(false);
  });

  it("reports emailSent: null when there's no address to send to", async () => {
    h.rows = [row({ email: null, type: "walk-in", patient_id: null })];
    const res = await patch("apt-1", { status: "confirmed" });
    expect(res.body.emailSent).toBeNull();
    expect(sendAppointmentEmail).not.toHaveBeenCalled();
  });
});

describe("double-booking protection", () => {
  it("refuses a new booking in a slot another patient already holds", async () => {
    h.rows = [row({ status: "pending" })];
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:00" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/already been taken/);
    expect(h.rows).toHaveLength(1); // nothing inserted
  });

  it("matches the dentist by name too, for older bookings saved without a dentist id", async () => {
    h.rows = [row({ dentist_id: null })];
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:00" } });
    expect(res.code).toBe(409);
  });

  it("allows the same time with a different dentist, or a free time with the same one", async () => {
    h.rows = [row()];
    const other = await call("POST", { body: { ...booking, dentistId: "dr-other", dentistName: "Aerhol Gocalin", date: "2026-09-25", time: "13:00" } });
    expect(other.code).toBe(201);
    const later = await call("POST", { body: { ...booking, date: "2026-09-25", time: "14:00" } });
    expect(later.code).toBe(201);
  });

  it("frees the slot again once a booking is cancelled or rejected", async () => {
    h.rows = [row({ status: "cancelled" }), row({ id: "apt-2", status: "rejected" })];
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:00" } });
    expect(res.code).toBe(201);
  });

  it("refuses rescheduling into a taken slot, but not staying put", async () => {
    h.rows = [row(), row({ id: "apt-2", patient_name: "Juan", status: "confirmed", time: "14:00" })];
    const into = await patch("apt-1", { status: "rescheduled", date: "2026-09-25", time: "14:00" });
    expect(into.code).toBe(409);
    expect(h.rows[0].time).toBe("13:00"); // unchanged

    const same = await patch("apt-1", { status: "rescheduled", date: "2026-09-25", time: "13:00" });
    expect(same.code).toBe(200); // its own slot doesn't count against it
  });

  it("blocks approving a request whose slot an approved booking already holds (the Sep 24 case)", async () => {
    h.rows = [
      row({ id: "juan", patient_name: "Juan Dela Cruz", type: "walk-in", status: "confirmed" }),
      row({ id: "allen", status: "pending" }),
    ];
    const res = await patch("allen", { status: "confirmed" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/Another approved appointment/);
    expect(h.rows[1].status).toBe("pending");
    expect(sendAppointmentEmail).not.toHaveBeenCalled(); // no "confirmed" email for a blocked approval

    // Rejecting it is still allowed — that's how the clash gets resolved.
    expect((await patch("allen", { status: "rejected", reason: "Slot taken" })).code).toBe(200);
  });

  it("lets the first of two clashing pending requests be approved", async () => {
    h.rows = [row({ id: "a" }), row({ id: "b", patient_name: "Maria" })];
    expect((await patch("a", { status: "confirmed" })).code).toBe(200);
    expect((await patch("b", { status: "confirmed" })).code).toBe(409);
  });

  it("gives patients the taken times for a dentist — and no patient details", async () => {
    h.session = { sub: "p-other", email: "someone@example.com", role: "patient" };
    h.rows = [
      row(), // Allen, another patient
      row({ id: "apt-2", time: "09:30", end_time: "10:30", status: "confirmed" }),
      row({ id: "apt-3", time: "10:00", status: "cancelled" }), // freed
      row({ id: "apt-4", time: "11:00", dentist_id: "dr-other", dentist_name: "Aerhol Gocalin" }), // other dentist
    ];
    const res = await call("GET", { query: { bookedSlots: "1", dentistId: DR, dentistName: "Dr. Mike Johnson", date: "2026-09-25" } });
    expect(res.code).toBe(200);
    expect(res.body.times).toEqual(expect.arrayContaining(["13:00", "09:30"]));
    expect(res.body.times).toHaveLength(2);
    // Spans, so a longer visit can be checked against them.
    expect(res.body.slots).toEqual(expect.arrayContaining([
      { time: "13:00", endTime: null }, { time: "09:30", endTime: "10:30" },
    ]));
    expect(JSON.stringify(res.body)).not.toMatch(/Allen|allen@example\.com/);
  });
});

describe("dentists can't complete unapproved bookings", () => {
  it("refuses to complete a pending appointment", async () => {
    h.session = { sub: DR, email: "dentist@ayagdental.com", role: "dentist" };
    h.rows = [row({ status: "pending" })];
    const res = await patch("apt-1", { status: "completed" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/Only approved appointments/);
    expect(h.rows[0].status).toBe("pending");
  });

  it("allows completing a confirmed or rescheduled one", async () => {
    h.session = { sub: DR, email: "dentist@ayagdental.com", role: "dentist" };
    h.rows = [row({ status: "confirmed" }), row({ id: "apt-2", status: "rescheduled", time: "14:00" })];
    expect((await patch("apt-1", { status: "completed" })).code).toBe(200);
    expect((await patch("apt-2", { status: "completed" })).code).toBe(200);
  });
});

describe("a service that was renamed", () => {
  it("reads back under the corrected spelling, without rewriting what's stored", async () => {
    h.rows = [row({ service: "Venners" })];
    const res = await patch("apt-1", { status: "confirmed" });

    expect(res.body.appointment.service).toBe("Veneers");
    expect(sendAppointmentEmail).toHaveBeenCalledWith(expect.objectContaining({ service: "Veneers" }));
    expect(h.rows[0].service).toBe("Venners"); // the row itself is left as it was
  });

  it("leaves every other service exactly as stored", async () => {
    h.rows = [row({ service: "Restoration" })];
    expect((await patch("apt-1", { status: "confirmed" })).body.appointment.service).toBe("Restoration");
  });
});

describe("appointments that run longer than one slot", () => {
  it("stores the end time the booking form worked out", async () => {
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:00", endTime: "14:30" } });
    expect(res.code).toBe(201);
    expect(res.body.appointment.endTime).toBe("14:30");
    expect(h.rows[0].end_time).toBe("14:30");
  });

  it("refuses a booking that would start inside a longer one", async () => {
    h.rows = [row({ time: "13:00", end_time: "14:30", status: "confirmed" })];
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "14:00", endTime: "14:30" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/already been taken/);
  });

  it("refuses a long booking that would swallow a later one", async () => {
    h.rows = [row({ time: "14:00", end_time: "14:30", status: "confirmed" })];
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:00", endTime: "15:00" } });
    expect(res.code).toBe(409);
  });

  it("allows a booking that ends exactly as the next one starts", async () => {
    h.rows = [row({ time: "14:30", end_time: "15:00", status: "confirmed" })];
    const res = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:00", endTime: "14:30" } });
    expect(res.code).toBe(201);
  });

  it("assumes half an hour for bookings saved before end times were recorded", async () => {
    h.rows = [row({ time: "13:00", end_time: null, status: "confirmed" })];
    const inside = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:15", endTime: "13:45" } });
    expect(inside.code).toBe(409);
    const after = await call("POST", { body: { ...booking, date: "2026-09-25", time: "13:30", endTime: "14:00" } });
    expect(after.code).toBe(201);
  });

  it("carries the visit's length across a reschedule", async () => {
    h.rows = [row({ time: "13:00", end_time: "14:30", status: "confirmed" })];
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    expect(res.code).toBe(200);
    expect(res.body.appointment.endTime).toBe("10:30"); // still 90 minutes
  });
});

describe("a patient rescheduling", () => {
  beforeEach(() => {
    h.session = { sub: "p1", email: "allen@example.com", role: "patient" };
    h.rows = [row({ status: "confirmed", time: "13:00", end_time: "14:00" })];
  });

  it("goes back to pending for the clinic to approve", async () => {
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    expect(res.code).toBe(200);
    expect(res.body.appointment.status).toBe("pending");
    expect(res.body.appointment.date).toBe("2026-09-26");
    expect(res.body.appointment.time).toBe("09:00");
    expect(res.body.appointment.endTime).toBe("10:00"); // keeps its length
  });

  it("has to move it to another day", async () => {
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-25", time: "15:00" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/different day/);
    expect(h.rows[0].time).toBe("13:00"); // left as it was
  });

  it("leaves staff free to move it within the same day", async () => {
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-25", time: "15:00" });
    expect(res.code).toBe(200);
  });

  it("still spends the patient's one move", async () => {
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    expect(res.body.appointment.rescheduleCount).toBe(1);
  });

  it("sends no email for the patient's own request", async () => {
    await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    expect(sendAppointmentEmail).not.toHaveBeenCalled();
  });

  it("emails the patient once the clinic approves the new time", async () => {
    await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    const res = await patch("apt-1", { status: "confirmed" });

    expect(res.body.appointment.status).toBe("confirmed");
    expect(res.body.emailSent).toBe(true);
    expect(sendAppointmentEmail).toHaveBeenCalledWith(expect.objectContaining({ status: "confirmed", time: "09:00" }));
  });

  it("still holds the new slot against other bookings while it waits", async () => {
    await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    const clash = await call("POST", { body: { ...booking, date: "2026-09-26", time: "09:30", endTime: "10:00" } });
    expect(clash.code).toBe(409);
  });

  it("leaves a staff reschedule approved, as the clinic's own decision", async () => {
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "09:00" });
    expect(res.body.appointment.status).toBe("rescheduled");
  });
});

describe("linking a guest's walk-ins to the account they made", () => {
  // The guest is named by name and number together, as Patient Records shows them.
  const link = (body: Record<string, unknown>) =>
    call("PATCH", { query: { linkGuest: "true" }, body: { contact: "0917 123 4567", ...body } });
  const acct = (over: Row) => ({
    id: "acct-9", first_name: "Rosa", middle_name: null, last_name: "Mendoza", contact_number: "0917-123-4567",
    age: 32, birthdate: null, sex: "Female", ...over,
  });
  const guest = (over: Row) => row({ patient_id: null, patient_name: "Rosa Mendoza", contact: "09171234567", age: 32, gender: "Female",
    type: "walk-in", status: "completed", ...over });
  const verified = { method: "id", confirmed: true, reason: "Checked her valid ID at the desk." };
  beforeEach(() => {
    h.accounts = [acct({})];
    h.rows = [
      guest({ id: "w-1", date: "2026-09-20" }),
      guest({ id: "w-2", date: "2026-10-05" }),
      row({ id: "w-3", patient_id: null, patient_name: "Pedro Reyes", type: "walk-in" }),
      row({ id: "a-1", patient_id: "p1", patient_name: "Rosa Mendoza" }),
    ];
  });
  const unlinked = () => h.rows.filter(r => r.patient_id === null).length;

  it("links straight away when the name and number match and nothing differs", async () => {
    const res = await link({ patientName: "Rosa Mendoza", patientId: "acct-9" });
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ linked: 2, verdict: "ok" });
    expect(Object.fromEntries(h.rows.map(r => [r.id, r.patient_id]))).toEqual({
      "w-1": "acct-9", "w-2": "acct-9", "w-3": null, "a-1": "p1",
    });
  });

  it("refuses a clearly different person, even with a confirmation", async () => {
    h.accounts = [acct({ first_name: "Ben", last_name: "Cruz", contact_number: "0919 999 0000" })];
    const res = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: verified });
    expect(res.code).toBe(409);
    expect(res.body.verdict).toBe("blocked");
    expect(unlinked()).toBe(3);
  });

  it("needs a confirmed identity when the details only partly match", async () => {
    h.accounts = [acct({ middle_name: "M." })]; // name is only "close"
    const bare = await link({ patientName: "Rosa Mendoza", patientId: "acct-9" });
    expect(bare.code).toBe(409);
    expect(bare.body.verdict).toBe("verify");
    expect(unlinked()).toBe(3);

    const unticked = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: { method: "id", confirmed: false } });
    expect(unticked.code).toBe(409);
    const madeUp = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: { method: "toString", confirmed: true } });
    expect(madeUp.code).toBe(409);

    // Nothing differs outright, so no reason is needed — just how it was confirmed.
    const ok = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: { method: "profile", confirmed: true } });
    expect(ok.code).toBe(200);
    expect(ok.body.linked).toBe(2);
  });

  it("also needs a reason when a detail actually differs", async () => {
    h.accounts = [acct({ contact_number: "0920 777 8888" })]; // same name, different number
    const noReason = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: { method: "id", confirmed: true } });
    expect(noReason.code).toBe(409);
    const tooShort = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: { method: "id", confirmed: true, reason: "ok" } });
    expect(tooShort.code).toBe(409);
    expect(unlinked()).toBe(3);

    const res = await link({ patientName: "Rosa Mendoza", patientId: "acct-9", verification: verified });
    expect(res.code).toBe(200);
    expect(res.body).toMatchObject({ linked: 2, verdict: "verify" });
  });

  it("compares with the guest's latest details and the account's age from its birthdate", async () => {
    h.rows.push(guest({ id: "w-4", date: "2026-10-09", contact: "0917 123 4567", age: 33 }));
    // Born on Jan 1st 33 years ago, so 33 today; the stored age is stale.
    h.accounts = [acct({ age: 10, birthdate: new Date(Date.UTC(new Date().getUTCFullYear() - 33, 0, 1)) })];
    const res = await link({ patientName: "Rosa Mendoza", patientId: "acct-9" });
    expect(res.code).toBe(200);
    expect(res.body.verdict).toBe("ok");
  });

  it("never sweeps along a namesake: same name, another number, stays put", async () => {
    h.rows.push(guest({ id: "w-9", contact: "0999 000 1111", age: 60 })); // a different Rosa Mendoza
    const res = await link({ patientName: "Rosa Mendoza", patientId: "acct-9" });
    expect(res.code).toBe(200);
    expect(res.body.linked).toBe(2);
    expect(h.rows.find(r => r.id === "w-9")!.patient_id).toBeNull();
  });

  it("links the namesake on their own when that's who was picked, judged on their own details", async () => {
    h.rows.push(guest({ id: "w-9", contact: "0999 000 1111", age: 60 })); // a different Rosa Mendoza
    // Rosa's account doesn't fit the other Rosa: her number is different.
    const res = await link({ patientName: "Rosa Mendoza", contact: "0999-000-1111", patientId: "acct-9" });
    expect(res.code).toBe(409);
    expect(res.body.verdict).toBe("verify");
    expect(h.rows.find(r => r.id === "w-9")!.patient_id).toBeNull();
  });

  it("refuses an account that doesn't exist, or a guest with nothing to link", async () => {
    expect((await link({ patientName: "Rosa Mendoza", patientId: "nobody" })).code).toBe(404);
    expect((await link({ patientName: "Nobody Here", patientId: "acct-9" })).code).toBe(404);
    expect((await link({ patientName: "Rosa Mendoza", contact: "0900 000 0000", patientId: "acct-9" })).code).toBe(404);
    expect(unlinked()).toBe(3);
  });

  it("needs both the guest's name and the account", async () => {
    expect((await link({ patientName: "Rosa Mendoza" })).code).toBe(400);
    expect((await link({ patientId: "acct-9" })).code).toBe(400);
  });

  it("is staff-only", async () => {
    h.session = { sub: "acct-9", email: "rosa@example.com", role: "patient" };
    expect((await link({ patientName: "Rosa Mendoza", patientId: "acct-9" })).code).toBe(403);
    h.session = { sub: "dr-1", email: "dr@example.com", role: "dentist" };
    expect((await link({ patientName: "Rosa Mendoza", patientId: "acct-9" })).code).toBe(403);
    expect(unlinked()).toBe(3);
  });
});

describe("a dentist's daily limit for a procedure", () => {
  const veneers = (over: Row = {}) => row({ service: "Veneers", status: "confirmed", ...over });
  beforeEach(() => { h.limits = [{ dentist_id: DR, service_name: "Veneers", daily_limit: 2 }]; });

  it("takes bookings up to the limit, then refuses the next one that day", async () => {
    h.rows = [veneers({ id: "v1", time: "09:00" })];
    const second = await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-25", time: "10:00" } });
    expect(second.code).toBe(201);
    const third = await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-25", time: "11:00" } });
    expect(third.code).toBe(409);
    expect(third.body.error).toMatch(/Veneers is fully booked with Dr. Mike Johnson on that day \(2 per day\)/);
  });

  it("counts a visit with several services toward each one, and leaves unlimited ones alone", async () => {
    h.rows = [veneers({ id: "v1", time: "09:00", service: "Oral, Veneers" }), veneers({ id: "v2", time: "10:00" })];
    expect((await call("POST", { body: { ...booking, service: "Veneers, Oral", date: "2026-09-25", time: "11:00" } })).code).toBe(409);
    expect((await call("POST", { body: { ...booking, service: "Oral", date: "2026-09-25", time: "11:00" } })).code).toBe(201);
  });

  it("doesn't count cancelled or rejected bookings, other days, or another dentist", async () => {
    h.rows = [
      veneers({ id: "v1", time: "09:00", status: "cancelled" }),
      veneers({ id: "v2", time: "10:00", status: "rejected" }),
      veneers({ id: "v3", time: "09:00", date: "2026-09-26" }),
      veneers({ id: "v4", time: "09:00", dentist_id: "dr-other", dentist_name: "Aerhol Gocalin" }),
    ];
    expect((await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-25", time: "11:00" } })).code).toBe(201);
  });

  it("refuses moving a booking onto a day that's full for its procedure, but not within its own day", async () => {
    h.rows = [
      veneers({ id: "v1", time: "09:00", date: "2026-09-26" }),
      veneers({ id: "v2", time: "10:00", date: "2026-09-26" }),
      veneers({ id: "apt-1", time: "13:00" }),
    ];
    const move = await patch("apt-1", { status: "rescheduled", date: "2026-09-26", time: "15:00" });
    expect(move.code).toBe(409);
    expect(move.body.error).toMatch(/fully booked/);
    const sameDay = await patch("apt-1", { status: "rescheduled", time: "15:00" });
    expect(sameDay.code).toBe(200);
  });
});

describe("a month of a dentist's bookings, for the calendar", () => {
  it("gives each day's taken spans and how many of each service, without patient details", async () => {
    h.rows = [
      row({ id: "a", date: "2026-09-25", time: "09:00", end_time: "10:00", service: "Veneers, Oral", status: "pending" }),
      row({ id: "b", date: "2026-09-25", time: "13:00", service: "Veneers", status: "confirmed" }),
      row({ id: "c", date: "2026-09-26", time: "09:00", service: "Oral", status: "cancelled" }),
    ];
    const res = await call("GET", { query: { availability: "1", dentistId: DR, from: "2026-09-01", to: "2026-09-30" } });
    expect(res.code).toBe(200);
    expect(res.body.days).toEqual({
      "2026-09-25": {
        slots: [{ time: "09:00", endTime: "10:00" }, { time: "13:00", endTime: null }],
        services: { Veneers: 2, Oral: 1 },
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Allen|example\.com/);
  });

  it("leaves out the booking being moved", async () => {
    h.rows = [row({ id: "a", date: "2026-09-25", service: "Veneers" })];
    const res = await call("GET", { query: { availability: "1", dentistId: DR, from: "2026-09-01", to: "2026-09-30", excludeId: "a" } });
    expect(res.body.days).toEqual({});
  });

  it("refuses a range of more than two months", async () => {
    const res = await call("GET", { query: { availability: "1", dentistId: DR, from: "2026-01-01", to: "2026-12-31" } });
    expect(res.code).toBe(400);
  });
});

describe("the services a dentist offers", () => {
  beforeEach(() => { h.offered = [{ dentist_id: DR, service_name: "Oral" }, { dentist_id: DR, service_name: "Veneers" }]; });

  it("takes a booking for a service the dentist offers", async () => {
    expect((await call("POST", { body: { ...booking, service: "Oral, Veneers", date: "2026-09-25", time: "10:00" } })).code).toBe(201);
  });

  it("refuses a service the dentist doesn't offer, and says which", async () => {
    const res = await call("POST", { body: { ...booking, service: "Oral, Implant", date: "2026-09-25", time: "10:00" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toBe("Dr. Mike Johnson doesn't offer Implant. Please choose another dentist for it.");
  });

  it("treats a dentist with no services chosen as offering them all", async () => {
    h.offered = [];
    expect((await call("POST", { body: { ...booking, service: "Implant", date: "2026-09-25", time: "10:00" } })).code).toBe(201);
  });

  it("refuses handing a booking to a dentist who doesn't offer it", async () => {
    h.offered = [{ dentist_id: "dr-other", service_name: "Oral" }];
    h.rows = [row({ service: "Veneers", status: "confirmed" })];
    const res = await patch("apt-1", { status: "rescheduled", dentistId: "dr-other", dentistName: "Aerhol Gocalin" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/Aerhol Gocalin doesn't offer Veneers/);
  });
});

describe("days and hours a dentist keeps for a service", () => {
  // 2026-09-25 is a Friday; 2026-09-28 a Monday.
  beforeEach(() => {
    h.hours = [{ dentist_id: DR, service_name: "Veneers", days: [1, 3], start_time: "09:00", end_time: "12:00" }];
  });

  it("takes a booking inside them", async () => {
    const res = await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-28", time: "10:00", endTime: "11:00" } });
    expect(res.code).toBe(201);
  });

  it("refuses another day of the week, and says when it's done", async () => {
    const res = await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-25", time: "10:00" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toBe("Veneers with Dr. Mike Johnson is only available Mon, Wed · 9:00 AM–12:00 PM. Please choose another date or time.");
  });

  it("refuses a visit that starts before or runs past its hours", async () => {
    expect((await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-28", time: "08:30" } })).code).toBe(409);
    expect((await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-28", time: "11:30", endTime: "12:30" } })).code).toBe(409);
  });

  it("applies to a visit that includes the service, and leaves other services alone", async () => {
    expect((await call("POST", { body: { ...booking, service: "Oral, Veneers", date: "2026-09-25", time: "10:00" } })).code).toBe(409);
    expect((await call("POST", { body: { ...booking, service: "Oral", date: "2026-09-25", time: "15:00" } })).code).toBe(201);
  });

  it("refuses moving the booking outside them", async () => {
    h.rows = [row({ service: "Veneers", status: "confirmed", date: "2026-09-28", time: "09:00", end_time: "10:00" })];
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-09-25", time: "09:00" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/only available Mon, Wed/);
    expect((await patch("apt-1", { status: "rescheduled", date: "2026-09-30", time: "10:00" })).code).toBe(200);
  });
});

describe("a different number of a service on each day", () => {
  // 2026-09-28 is a Monday, 2026-09-30 a Wednesday.
  beforeEach(() => {
    h.hours = [{ dentist_id: DR, service_name: "Veneers", days: [1, 3], start_time: null, end_time: null, day_limits: { "1": 1, "3": 2 } }];
  });

  it("holds each day to its own number", async () => {
    h.rows = [row({ id: "v1", service: "Veneers", status: "confirmed", date: "2026-09-28", time: "09:00" })];
    const monday = await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-28", time: "10:00" } });
    expect(monday.code).toBe(409);
    expect(monday.body.error).toMatch(/Veneers is fully booked with Dr. Mike Johnson on that day \(1 on Mondays\)/);
    h.rows = [row({ id: "v1", service: "Veneers", status: "confirmed", date: "2026-09-30", time: "09:00" })];
    expect((await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-30", time: "10:00" } })).code).toBe(201);
  });

  it("puts no limit on a day without a number", async () => {
    h.hours[0].day_limits = { "1": 1 };
    h.rows = [1, 2, 3].map((n) => row({ id: `v${n}`, service: "Veneers", status: "confirmed", date: "2026-09-30", time: `0${n + 6}:00` }));
    expect((await call("POST", { body: { ...booking, service: "Veneers", date: "2026-09-30", time: "13:00" } })).code).toBe(201);
  });
});

describe("a patient booking a time today", () => {
  // Sunday, Oct 25 2026 at 2:05 PM in Manila (06:05 UTC).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-25T06:05:00Z"));
    h.session = { sub: "p1", email: "allen@example.com", role: "patient" };
  });
  afterEach(() => vi.useRealTimers());

  it("is refused less than an hour from now", async () => {
    const res = await call("POST", { body: { ...booking, date: "2026-10-25", time: "15:00", endTime: "15:30" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/at least 1 hour from now/);
  });

  it("goes through an hour or more from now", async () => {
    const res = await call("POST", { body: { ...booking, date: "2026-10-25", time: "15:30", endTime: "16:00" } });
    expect(res.code).toBe(201);
  });

  it("is refused when moving one to less than an hour from now", async () => {
    h.rows = [row({ status: "confirmed", date: "2026-10-28", time: "13:00", end_time: "13:30" })];
    const res = await patch("apt-1", { status: "rescheduled", date: "2026-10-25", time: "14:30" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/at least 1 hour from now/);
  });

  it("doesn't hold the front desk to it", async () => {
    h.session = { sub: "admin-1", email: "admin@admin.com", role: "admin" };
    const res = await call("POST", { body: { ...booking, type: "walk-in", date: "2026-10-25", time: "14:30", endTime: "15:00" } });
    expect(res.code).toBe(201);
  });
});

describe("a request still pending when its time comes", () => {
  // Monday, Oct 26 2026 at 10:05 AM in Manila (02:05 UTC).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-26T02:05:00Z"));
    h.expire = true;
  });
  afterEach(() => vi.useRealTimers());

  const pending = (id: string, date: string, time: string) => row({ id, status: "pending", date, time, end_time: null });

  it("is closed once its start time has passed, and only then", async () => {
    h.rows = [
      pending("yesterday", "2026-10-25", "15:00"),
      pending("earlier-today", "2026-10-26", "10:00"),
      pending("later-today", "2026-10-26", "11:00"),
      pending("tomorrow", "2026-10-27", "09:00"),
      row({ id: "approved", status: "confirmed", date: "2026-10-25", time: "09:00" }),
    ];
    // Any request closes them; this one asks for a day's free times.
    await call("GET", { query: { bookedSlots: "1", date: "2026-10-27", dentistId: DR } });
    const status = Object.fromEntries(h.rows.map((r) => [r.id, r.status]));
    expect(status).toEqual({
      yesterday: "rejected", "earlier-today": "rejected", "later-today": "pending", tomorrow: "pending", approved: "confirmed",
    });
    expect(h.rows[0].reason).toMatch(/not approved before the appointment time/);
  });

  it("stops holding the dentist's time", async () => {
    h.rows = [pending("earlier-today", "2026-10-26", "10:00")];
    const res = await call("GET", { query: { bookedSlots: "1", date: "2026-10-26", dentistId: DR } });
    expect(res.body.slots).toEqual([]);
  });

  it("can't be approved afterwards", async () => {
    h.rows = [pending("yesterday", "2026-10-25", "15:00")];
    const res = await patch("yesterday", { status: "confirmed" });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/time passed before it was approved/);
    expect(sendAppointmentEmail).not.toHaveBeenCalled();
  });

  it("can still be approved before its time", async () => {
    h.rows = [pending("later-today", "2026-10-26", "11:00")];
    const res = await patch("later-today", { status: "confirmed" });
    expect(res.code).toBe(200);
    expect(res.body.appointment.status).toBe("confirmed");
  });
});

describe("one visit per service a day", () => {
  it("refuses a patient's second booking of the same service that day", async () => {
    h.session = { sub: "p1", email: "allen@example.com", role: "patient" };
    h.rows = [row({ status: "confirmed", date: "2099-01-05", time: "09:00", service: "Oral" })];
    const res = await call("POST", { body: { ...booking, patientName: "Allen Estrella", date: "2099-01-05", time: "14:00" } });
    expect(res.code).toBe(409);
    expect(res.body.error).toMatch(/Oral is already booked for this patient on this day, at 9:00 AM/);
  });

  it("matches one service inside a visit for several", async () => {
    h.session = { sub: "p1", email: "allen@example.com", role: "patient" };
    h.rows = [row({ status: "pending", date: "2099-01-05", time: "09:00", service: "Cleaning, Oral" })];
    const res = await call("POST", { body: { ...booking, patientName: "Allen Estrella", date: "2099-01-05", time: "14:00" } });
    expect(res.code).toBe(409);
  });

  it("allows another service that day, the same service another day, and after a cancellation", async () => {
    h.session = { sub: "p1", email: "allen@example.com", role: "patient" };
    h.rows = [
      row({ id: "a", status: "confirmed", date: "2099-01-05", time: "09:00", service: "Cleaning" }),
      row({ id: "b", status: "cancelled", date: "2099-01-06", time: "09:00", service: "Oral" }),
    ];
    expect((await call("POST", { body: { ...booking, patientName: "Allen", date: "2099-01-05", time: "14:00" } })).code).toBe(201);
    expect((await call("POST", { body: { ...booking, patientName: "Allen", date: "2099-01-06", time: "14:00" } })).code).toBe(201);
  });

  it("doesn't mix up two patients", async () => {
    h.session = { sub: "p2", email: "maria@example.com", role: "patient" };
    h.rows = [row({ status: "confirmed", date: "2099-01-05", time: "09:00", service: "Oral" })];
    expect((await call("POST", { body: { ...booking, date: "2099-01-05", time: "14:00" } })).code).toBe(201);
  });

  it("checks a guest walk-in by name and number", async () => {
    h.rows = [row({ patient_id: null, patient_name: "Jose", contact: "0917 123 4567", status: "confirmed", date: "2099-01-05", time: "09:00" })];
    const walkIn = { ...booking, patientName: "Jose", type: "walk-in", date: "2099-01-05", time: "14:00" };
    expect((await call("POST", { body: { ...walkIn, contact: "09171234567" } })).code).toBe(409);
    expect((await call("POST", { body: { ...walkIn, contact: "09998887777" } })).code).toBe(201);
  });

  it("refuses moving an appointment onto a day that already has that service", async () => {
    h.rows = [
      row({ id: "a", status: "confirmed", date: "2099-01-05", time: "09:00", service: "Oral" }),
      row({ id: "b", status: "confirmed", date: "2099-01-07", time: "09:00", service: "Oral" }),
    ];
    const res = await patch("b", { date: "2099-01-05", time: "14:00" });
    expect(res.code).toBe(409);
    // Moving within its own day is not a clash with itself.
    expect((await patch("b", { time: "15:00" })).code).toBe(200);
  });
});
