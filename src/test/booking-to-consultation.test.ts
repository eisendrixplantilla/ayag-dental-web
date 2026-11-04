import { beforeEach, describe, expect, it, vi } from "vitest";

// One visit from start to finish, through the real API handlers: the patient books, the
// front desk approves, the patient signs the consent at the clinic, the dentist records the
// consultation and completes it, and the patient reads it back. The database is one small
// in-memory store shared by every step, so what one step writes is what the next one reads.
type Row = Record<string, any>;
const h = vi.hoisted(() => ({
  session: { sub: "pt-1", email: "eisen@example.com", role: "patient" } as { sub: string; email: string; role: string },
  appointments: [] as Row[],
  consents: [] as Row[],
  records: [] as Row[],
  treatments: [] as Row[],
  prescriptions: [] as Row[],
  services: [{ id: "svc-oral", service_name: "Oral", duration: 30 }] as Row[],
  users: [
    { id: "dr-1", first_name: "Aerhol", middle_name: null, last_name: "Gocalin", email: "aint@example.com", role: "dentist" },
    { id: "dr-2", first_name: "Mike", middle_name: null, last_name: "Johnson", email: "mike@example.com", role: "dentist" },
    { id: "ad-1", first_name: "Sarah", middle_name: null, last_name: "Chen", email: "admin@admin.com", role: "admin" },
  ] as Row[],
  n: 0,
  unknown: [] as string[],
}));

const DR = "dr-1";
const DR_NAME = "Aerhol Gocalin";
const fullName = (u: Row) => [u.first_name, u.middle_name, u.last_name].filter(Boolean).join(" ");

async function run(text: string, v: any[]): Promise<Row[]> {
  // Tables and columns made sure of on first use: nothing to do in memory.
  if (/^\s*(\/\*[^*]*\*\/\s*)?(CREATE|ALTER)\b/.test(text)) return [];
  if (text.includes("assign-codes")) return [];
  if (text.includes("expire-pending")) return [];

  // --- whose visit it is (dentists write only their own records). First: its SQL looks
  // the dentist's name up in users, which the consent rules below would answer instead. ---
  if (text.includes("own-check")) {
    const [id, dentist] = v as [string, string]; // sql.query(text, [id, dentist])
    const apt = text.includes("own-check:record")
      ? h.appointments.find((a) => a.id === h.records.find((r) => r.id === id)?.appointment_id)
      : h.appointments.find((a) => a.id === id);
    if (!apt) return [];
    const u = h.users.find((x) => x.id === dentist);
    return [{ own: apt.dentist_id === dentist || (!apt.dentist_id && !!u && apt.dentist_name === fullName(u)) }];
  }

  // --- booking rules: the dentist's day, leave, limits, other bookings ---
  if (text.includes("slot-clash") || text.includes("booked-slots")) {
    const [date, statuses, dentistId, , excludeId] = v;
    return h.appointments.filter((r) => r.date === date && statuses.includes(r.status) && r.dentist_id === dentistId && r.id !== excludeId)
      .map((r) => ({ time: r.time, end_time: r.end_time }));
  }
  if (text.includes("patient-same-day")) {
    const [date, statuses, patientId, , , , excludeId] = v;
    return h.appointments.filter((r) => r.date === date && statuses.includes(r.status) && r.patient_id === patientId && r.id !== excludeId)
      .map((r) => ({ service: r.service, time: r.time }));
  }
  if (text.includes("day-service-counts")) {
    const [date, statuses, dentistId, , excludeId] = v;
    return h.appointments.filter((r) => r.date === date && statuses.includes(r.status) && r.dentist_id === dentistId && r.id !== excludeId)
      .map((r) => ({ service: r.service }));
  }
  if (/away-day|away-leave|offered-services|service-hours|service-limits|dentists-by-name|unavailable-times/.test(text)) return [];

  // --- appointments ---
  if (text.includes("INSERT INTO appointments")) {
    const [patient_id, patient_name, contact, email, age, gender, dentist_id, dentist_name, service, date, time, end_time, type, status, reason, created_by] = v;
    const row = { id: `apt-${++h.n}`, reference: null, patient_id, patient_name, contact, email, age, gender, dentist_id, dentist_name, service, date, time,
      end_time, type, status, reason, remarks: null, reschedule_count: 0, created_by, created_at: "2026-11-04T01:00:00Z", updated_at: "2026-11-04T01:00:00Z" };
    h.appointments.push(row);
    return [{ ...row }];
  }
  if (text.includes("SELECT * FROM appointments WHERE id")) return h.appointments.filter((r) => r.id === v[0]).map((r) => ({ ...r }));
  if (text.includes("UPDATE appointments")) {
    const [status, date, time, end_time, reason, remarks, dentist_id, dentist_name, inc, id] = v;
    const row = h.appointments.find((r) => r.id === id)!;
    Object.assign(row, Object.fromEntries(Object.entries({ status, date, time, end_time, reason, remarks, dentist_id, dentist_name }).filter(([, x]) => x !== null)));
    row.reschedule_count += inc;
    return [{ ...row }];
  }

  // --- consent ---
  if (text.includes("consent-template")) return [{ name: "Ayag Dental Clinic", consent_text: null }];
  if (text.includes("consent-appointment") || (text.includes("FROM appointments") && text.includes("consent"))) {
    return h.appointments.filter((r) => r.id === v[0]).map((r) => ({ ...r }));
  }
  if (text.includes("consent-recorder")) {
    return h.users.filter((u) => u.id === v[0]).map((u) => ({ ...u }));
  }
  if (text.includes("INSERT INTO consents")) {
    const [appointment_id, status, patient_name, procedure, dentist_name, consent_text, signature, decline_reason, recorded_by] = v;
    // ON CONFLICT ... WHERE consents.status = 'declined': a signed one stays as it is.
    if (h.consents.some((c) => c.appointment_id === appointment_id && c.status === "signed")) return [];
    const row = { id: `con-${++h.n}`, appointment_id, status, patient_name, procedure, dentist_name, consent_text, signature,
      decline_reason, recorded_by, signed_at: "2026-11-04T02:00:00Z" };
    h.consents = h.consents.filter((c) => c.appointment_id !== appointment_id).concat(row);
    return [row];
  }
  if (text.includes("consent-list")) return h.consents.map((c) => ({ ...c }));
  if (text.includes("FROM consents")) return h.consents.filter((c) => c.appointment_id === v[0]).map((c) => ({ ...c }));

  // --- dental records ---
  if (text.includes("SELECT id, date FROM appointments")) return h.appointments.filter((r) => r.id === v[0]).map((r) => ({ id: r.id, date: r.date }));
  if (text.includes("INSERT INTO dental_records")) {
    const [appointment_id, date, diagnosis, tooth_number, tooth_codes, tooth_notes, treatment_notes, next_visit] = v;
    const row = { id: `rec-${++h.n}`, appointment_id, date, diagnosis, tooth_number, tooth_codes: JSON.parse(tooth_codes ?? "{}"),
      tooth_notes: JSON.parse(tooth_notes ?? "{}"), treatment_notes, next_visit, created_at: "2026-11-04T03:00:00Z" };
    h.records.push(row);
    return [{ id: row.id }];
  }
  if (text.includes("SELECT id FROM services WHERE service_name = ANY")) {
    const names: string[] = v[0];
    return h.services.filter((s) => names.includes(s.service_name)).map((s) => ({ id: s.id }));
  }
  if (text.includes("DELETE FROM treatments") || text.includes("DELETE FROM prescriptions")) return [];
  if (text.includes("INSERT INTO treatments")) {
    const [record_id, service_id, teeth] = v;
    h.treatments.push({ id: `tr-${++h.n}`, record_id, service_id, teeth });
    return [];
  }
  if (text.includes("INSERT INTO prescriptions")) {
    const [record_id, medicine, dosage, instructions] = v;
    h.prescriptions.push({ id: `rx-${++h.n}`, record_id, medicine, dosage, instructions });
    return [];
  }
  if (text.includes("FROM treatments t")) {
    const ids: string[] = v[0];
    return h.treatments.filter((t) => ids.includes(t.record_id))
      .map((t) => ({ ...t, service_name: h.services.find((s) => s.id === t.service_id)?.service_name }));
  }
  if (text.includes("FROM prescriptions")) return h.prescriptions.filter((p) => (v[0] as string[]).includes(p.record_id));
  if (text.includes("FROM dental_records dr")) {
    const joined: Row[] = h.records.map((r) => {
      const a = h.appointments.find((x) => x.id === r.appointment_id)!;
      return { ...r, apt_patient_id: a.patient_id, apt_patient_name: a.patient_name, apt_dentist_id: a.dentist_id, apt_dentist_name: a.dentist_name };
    });
    if (text.includes("WHERE dr.id")) return joined.filter((r) => r.id === v[0]);
    if (text.includes("a.patient_id =")) return joined.filter((r) => r.apt_patient_id === v[0]);
    return joined;
  }

  // --- lists ---
  if (/FROM appointments/.test(text) && /ORDER BY/.test(text)) {
    return h.appointments.filter((r) => h.session.role !== "patient" || r.patient_id === h.session.sub).map((r) => ({ ...r }));
  }

  h.unknown.push(text.replace(/\s+/g, " ").slice(0, 160));
  throw new Error(`unexpected query: ${text.replace(/\s+/g, " ").slice(0, 160)}`);
}

vi.mock("../../api/_lib/db.js", () => {
  const sql = vi.fn(async (strings: TemplateStringsArray, ...v: any[]) => run(strings.join("?"), v));
  return { sql: Object.assign(sql, { query: vi.fn(async (text: string, v: any[] = []) => run(text, v)) }) };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => h.session }));
const sendAppointmentEmail = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../api/_lib/email.js", () => ({ sendAppointmentEmail }));

import appointments from "../../api/appointments";
import dentalRecords from "../../api/dental-records";

type Res = { code?: number; body?: any };
function call(handler: unknown, method: string, query: Record<string, string> = {}, body?: Record<string, unknown>): Promise<Res> {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader() { return this; },
  };
  return (handler as any)({ method, query, body, headers: {} }, res).then(() => res);
}
const as = (role: string, sub: string) => { h.session = { sub, email: `${sub}@example.com`, role }; };
const SIGNATURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

beforeEach(() => {
  Object.assign(h, { appointments: [], consents: [], records: [], treatments: [], prescriptions: [], n: 0, unknown: [] });
  sendAppointmentEmail.mockClear();
});

describe("a visit from booking to consultation", () => {
  it("goes all the way through, each step reading what the last one wrote", async () => {
    // 1. The patient books Oral Prophylaxis with Aerhol, a while ahead.
    as("patient", "pt-1");
    const booked = await call(appointments, "POST", {}, {
      // As the booking page sends it: the patient's own name and email.
      patientName: "Eisen Drix Plantilla", email: "eisen@example.com", dentistId: DR, dentistName: DR_NAME,
      service: "Oral Prophylaxis", type: "online", date: "2099-01-05", time: "09:00", endTime: "09:30",
    });
    expect(booked.code, JSON.stringify(booked.body)).toBe(201);
    const apt = booked.body.appointment;
    expect(apt).toMatchObject({ status: "pending", patientId: "pt-1", service: "Oral Prophylaxis", dentistId: DR });

    // A pending request can't be consulted on yet.
    as("dentist", DR);
    const early = await call(appointments, "POST", { consent: "true" }, { appointmentId: apt.id, decision: "signed", printedName: "Eisen", signature: SIGNATURE });
    expect(early.code).toBe(409);
    const tooSoon = await call(appointments, "PATCH", { id: apt.id }, { status: "completed" });
    expect(tooSoon.code).toBe(409);

    // 2. The front desk approves it, and the patient is emailed.
    as("admin", "ad-1");
    const approved = await call(appointments, "PATCH", { id: apt.id }, { status: "confirmed" });
    expect(approved.code, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.appointment.status).toBe("confirmed");
    expect(sendAppointmentEmail).toHaveBeenCalledTimes(1);

    // 3. At the clinic the patient signs the consent on the dentist's screen.
    as("dentist", DR);
    const consent = await call(appointments, "POST", { consent: "true" }, {
      appointmentId: apt.id, decision: "signed", printedName: "Eisen Drix Plantilla", signature: SIGNATURE,
    });
    expect(consent.code, JSON.stringify(consent.body)).toBe(201);
    expect(consent.body.consent).toMatchObject({ appointmentId: apt.id, status: "signed" });
    const listed = await call(appointments, "GET", { consents: "true" });
    expect(listed.body.consents).toEqual([expect.objectContaining({ appointmentId: apt.id, status: "signed" })]);
    // Signed is final.
    const again = await call(appointments, "POST", { consent: "true" }, { appointmentId: apt.id, decision: "declined" });
    expect(again.code).toBe(409);

    // 4. The consultation: the visit is completed and its dental record written.
    const done = await call(appointments, "PATCH", { id: apt.id }, { status: "completed" });
    expect(done.code, JSON.stringify(done.body)).toBe(200);
    expect(done.body.appointment.status).toBe("completed");
    const record = await call(dentalRecords, "POST", {}, {
      appointmentId: apt.id, date: apt.date, diagnosis: "Mild plaque and tartar buildup", toothNumber: "16",
      treatments: [{ serviceName: "Oral Prophylaxis", teeth: "16" }],
      treatmentNotes: "Scaling and polishing done.", prescriptions: [{ medicine: "Chlorhexidine mouthwash" }],
    });
    expect(record.code, JSON.stringify(record.body)).toBe(201);
    // Saved against the service stored as "Oral", read back under its current name.
    expect(h.treatments).toEqual([expect.objectContaining({ service_id: "svc-oral", teeth: "16" })]);
    expect(record.body.record).toMatchObject({
      appointmentId: apt.id, patientId: "pt-1", dentistId: DR, diagnosis: "Mild plaque and tartar buildup",
      treatments: [expect.objectContaining({ serviceName: "Oral Prophylaxis", teeth: "16" })],
      prescriptions: [expect.objectContaining({ medicine: "Chlorhexidine mouthwash" })],
    });

    // The dentist's own records list has it.
    const mine = await call(dentalRecords, "GET");
    expect(mine.body.records.map((r: Row) => r.appointmentId)).toEqual([apt.id]);

    // 5. The patient sees the visit completed and the record of it.
    as("patient", "pt-1");
    const theirs = await call(appointments, "GET");
    expect(theirs.body.appointments).toEqual([expect.objectContaining({ id: apt.id, status: "completed", service: "Oral Prophylaxis" })]);
    const theirRecords = await call(dentalRecords, "GET");
    expect(theirRecords.body.records).toEqual([expect.objectContaining({ appointmentId: apt.id, diagnosis: "Mild plaque and tartar buildup" })]);

    expect(h.unknown).toEqual([]);
  });

  it("keeps another dentist out of the visit's consultation", async () => {
    as("patient", "pt-1");
    const apt = (await call(appointments, "POST", {}, {
      patientName: "Eisen", dentistId: DR, dentistName: DR_NAME, service: "Oral Prophylaxis", type: "online", date: "2099-01-05", time: "10:00", endTime: "10:30",
    })).body.appointment;
    as("admin", "ad-1");
    await call(appointments, "PATCH", { id: apt.id }, { status: "confirmed" });

    as("dentist", "dr-2");
    const record = await call(dentalRecords, "POST", {}, { appointmentId: apt.id, diagnosis: "Caries", treatments: [{ serviceName: "Oral Prophylaxis" }] });
    expect(record.code).toBe(403);
    expect(h.records).toEqual([]);
  });
});
