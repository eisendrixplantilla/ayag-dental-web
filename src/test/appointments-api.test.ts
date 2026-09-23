import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/appointments.ts handler. The database is a small in-memory table
// that understands the handful of queries the handler makes; the session check and
// the outbound email call are faked.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  rows: [] as Row[],
  session: { sub: "admin-1", email: "admin@admin.com", role: "admin" } as { sub: string; email: string; role: string },
  n: 0,
}));

const sameDentist = (r: Row, id: string | null, name: string | null) =>
  (id !== null && r.dentist_id === id) || (name !== null && r.dentist_name === name);

vi.mock("../../api/_lib/db.js", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => {
    const text = strings.join("?");
    if (text.includes("slot-clash")) {
      const [date, time, statuses, dentistId, dentistName, excludeId] = v;
      return h.rows.filter(r => r.date === date && r.time === time && statuses.includes(r.status)
        && sameDentist(r, dentistId, dentistName) && r.id !== excludeId).slice(0, 1).map(() => ({ "?column?": 1 }));
    }
    if (text.includes("booked-slots")) {
      const [date, statuses, dentistId, dentistName, excludeId] = v;
      const times = h.rows.filter(r => r.date === date && statuses.includes(r.status)
        && sameDentist(r, dentistId, dentistName) && r.id !== excludeId).map(r => r.time);
      return [...new Set(times)].map(time => ({ time }));
    }
    if (text.includes("INSERT INTO appointments")) {
      const [patient_id, patient_name, contact, email, dentist_id, dentist_name, service, date, time, type, status, reason, created_by] = v;
      const row = { id: `new-${++h.n}`, patient_id, patient_name, contact, email, dentist_id, dentist_name, service, date, time, type,
        status, reason, remarks: null, reschedule_count: 0, created_by, end_time: null,
        created_at: "2026-09-23T00:00:00Z", updated_at: "2026-09-23T00:00:00Z" };
      h.rows.push(row);
      return [row];
    }
    if (text.includes("UPDATE appointments")) {
      const [status, date, time, reason, remarks, dentist_id, dentist_name, inc, id] = v;
      const row = h.rows.find(r => r.id === id)!;
      Object.assign(row, Object.fromEntries(Object.entries({ status, date, time, reason, remarks, dentist_id, dentist_name })
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
      row({ id: "apt-2", time: "09:30", status: "confirmed" }),
      row({ id: "apt-3", time: "10:00", status: "cancelled" }), // freed
      row({ id: "apt-4", time: "11:00", dentist_id: "dr-other", dentist_name: "Aerhol Gocalin" }), // other dentist
    ];
    const res = await call("GET", { query: { bookedSlots: "1", dentistId: DR, dentistName: "Dr. Mike Johnson", date: "2026-09-25" } });
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ times: expect.arrayContaining(["13:00", "09:30"]) });
    expect(res.body.times).toHaveLength(2);
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

    expect(res.body.appointment.service).toBe("Veeners");
    expect(sendAppointmentEmail).toHaveBeenCalledWith(expect.objectContaining({ service: "Veeners" }));
    expect(h.rows[0].service).toBe("Venners"); // the row itself is left as it was
  });

  it("leaves every other service exactly as stored", async () => {
    h.rows = [row({ service: "Restoration" })];
    expect((await patch("apt-1", { status: "confirmed" })).body.appointment.service).toBe("Restoration");
  });
});
