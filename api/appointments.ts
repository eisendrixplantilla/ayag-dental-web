import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";
import { sendAppointmentEmail } from "./_lib/email.js";
import { displayService } from "./_lib/services.js";
import { joinName } from "./_lib/name.js";
import { manilaDateStr, manilaNowMinutes } from "./_lib/date.js";
import { MIN_REASON_LENGTH, VERIFICATION_METHODS, ageFrom, assessLink } from "./_lib/guestMatch.js";
import { notOffered, outsideServiceHours, overLimit, servicesOf } from "./_lib/bookingLimits.js";
import { assignCodes, ensureCodes } from "./_lib/codes.js";
import { consentHandler } from "./_lib/consent.js";

const NOTIFY_STATUSES = new Set(["confirmed", "rejected", "cancelled", "rescheduled"]);

/** Statuses that occupy a dentist's time slot. */
const HOLDING = ["pending", "confirmed", "rescheduled"];
/** Statuses the dentist can act on (consult, reschedule, cancel) — i.e. approved. */
const APPROVED = ["confirmed", "rescheduled"];

const SLOT_TAKEN = "That time slot has already been taken. Please choose another time.";

/** How far ahead of now a patient has to book a time today, so they can get to the
 * clinic. Matches BOOKING_LEAD_MINUTES on the booking pages. Staff aren't held to it. */
const LEAD_MINUTES = 60;
const TOO_SOON = "Please choose a time at least 1 hour from now, so you have time to get to the clinic.";
/** Whether a time today is within the lead time from now. Other days are left alone. */
const tooSoon = (date: string, time: string) =>
  date === manilaDateStr(new Date()) && toMinutes(time) < manilaNowMinutes() + LEAD_MINUTES;

const SAME_DAY = "Please choose a different day. A reschedule has to move your appointment to another date.";

const isoDate = (d: unknown) => new Date(d as string).toISOString().slice(0, 10);

/** How long a booking occupies when nothing says otherwise — including the rows saved
 * before end times were recorded. */
const DEFAULT_MINUTES = 30;
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const spanOf = (start: string, end: string | null) =>
  ({ from: toMinutes(start), to: end ? toMinutes(end) : toMinutes(start) + DEFAULT_MINUTES });

/**
 * Is this dentist's slot already held by another booking? Dentists are matched by id
 * or by name, because older bookings only carry the name. `statuses` says which
 * bookings count as holding it: any live one for a new booking or a move, but only
 * approved ones when approving, so the first of two clashing requests can still be
 * approved and the other rejected.
 */
async function slotTaken(opts: {
  dentistId: string | null; dentistName: string | null; date: string; time: string;
  endTime?: string | null; excludeId?: string | null; statuses?: string[];
}): Promise<boolean> {
  if (!opts.dentistId && !opts.dentistName) return false;
  const rows = await sql`
    SELECT time, end_time /* slot-clash */ FROM appointments
    WHERE date = ${opts.date}
      AND status = ANY(${opts.statuses ?? HOLDING}::text[])
      AND (dentist_id = ${opts.dentistId} OR dentist_name = ${opts.dentistName})
      AND (${opts.excludeId ?? null}::uuid IS NULL OR id <> ${opts.excludeId ?? null}::uuid)`;
  // A booking now covers a span, not just a start time, so two of them clash when the
  // spans overlap. Comparing in minutes keeps it out of reach of time-zone surprises;
  // one dentist's day is a handful of rows either way.
  const want = spanOf(opts.time, opts.endTime ?? null);
  return (rows as { time: string; end_time: string | null }[]).some((r) => {
    const held = spanOf(r.time, r.end_time);
    return want.from < held.to && want.to > held.from;
  });
}

/**
 * Does this patient already have a live booking that day for one of the same services?
 * A patient is matched by account, or, for a guest walk-in without one, by the same name
 * and contact number (as digits); a guest with no number can't be told apart, so isn't
 * checked. Returns the message to answer with, or null when there's no clash.
 */
async function sameServiceSameDay(opts: {
  patientId: string | null; patientName: string | null; contact: string | null;
  date: string; service: string; excludeId?: string | null;
}): Promise<string | null> {
  const digits = String(opts.contact ?? "").replace(/\D/g, "");
  if (!opts.patientId && !digits) return null;
  const rows = await sql`
    SELECT service, time /* patient-same-day */ FROM appointments
    WHERE date = ${opts.date}
      AND status = ANY(${HOLDING}::text[])
      AND (patient_id = ${opts.patientId}
        OR (${opts.patientId}::uuid IS NULL AND patient_id IS NULL AND patient_name = ${opts.patientName}
          AND regexp_replace(coalesce(contact, ''), '[^0-9]', '', 'g') = ${digits}))
      AND (${opts.excludeId ?? null}::uuid IS NULL OR id <> ${opts.excludeId ?? null}::uuid)`;
  const wanted = new Set(servicesOf(opts.service));
  for (const r of rows as { service: string; time: string }[]) {
    const same = servicesOf(r.service).find((s) => wanted.has(s));
    if (same) {
      return `${displayService(same)} is already booked for this patient on this day, at ${toLabel(r.time)}. `
        + "A service can be booked once a day: choose another day or another service.";
    }
  }
  return null;
}

/** "13:00" → "1:00 PM". */
const toLabel = (t: string) => {
  const m = toMinutes(t);
  return `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
};

/**
 * Guest walk-ins save age and gender, which databases migrated before those columns
 * existed don't have yet. Add them on first use (once per instance) so bookings keep
 * working without a separate migrate run; the statement is a no-op once they exist.
 */
let guestColumns: Promise<void> | null = null;
function ensureGuestColumns() {
  guestColumns ??= sql`
    /* guest-columns */ ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS age INTEGER,
      ADD COLUMN IF NOT EXISTS gender TEXT`
    .then(() => undefined)
    .catch((err) => {
      // Retry on the next booking; if the columns really are missing the insert reports it.
      guestColumns = null;
      console.error("Could not add guest walk-in columns", err);
    });
  return guestColumns;
}

function mapRow(r: any) {
  return {
    id: r.id,
    /** The appointment's reference: APT-261000001 (see codes.ts). */
    reference: r.reference ?? null,
    patientId: r.patient_id,
    patientName: r.patient_name,
    contact: r.contact,
    email: r.email,
    age: r.age,
    gender: r.gender,
    dentistId: r.dentist_id,
    dentistName: r.dentist_name,
    service: displayService(r.service),
    date: new Date(r.date).toISOString().slice(0, 10),
    time: r.time,
    endTime: r.end_time,
    type: r.type,
    status: r.status,
    reason: r.reason,
    remarks: r.remarks,
    rescheduleCount: r.reschedule_count,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Why a request was closed by the clock rather than by staff. */
export const EXPIRED_REASON = "Expired: not approved before the appointment time.";

/**
 * A request still pending when its start time comes is closed: it can no longer be
 * approved for a moment already gone, and it stops holding the dentist's time. There's no
 * scheduled job, so this runs as appointments are looked at, before anything is answered.
 */
async function expireOverduePending() {
  const today = manilaDateStr(new Date());
  const now = toTime(manilaNowMinutes());
  await sql`
    UPDATE appointments /* expire-pending */
    SET status = 'rejected', reason = ${EXPIRED_REASON}, updated_at = now()
    WHERE status = 'pending' AND (date < ${today}::date OR (date = ${today}::date AND time <= ${now}))`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  // Never in the way of the request itself: at worst an overdue one waits for the next.
  await expireOverduePending().catch((err) => console.error("Expiring overdue requests failed:", err));

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  // The patient's consent to the procedure (see _lib/consent).
  if (req.query.consent || req.query.consents) return consentHandler(req, res, session);

  if (req.method === "GET") {
    // Bookings from before references get theirs before any is shown.
    await ensureCodes("appointments");
    const q = (k: string) => (typeof req.query[k] === "string" && req.query[k] ? String(req.query[k]) : null);

    // What a booking calendar needs to show how full each day of a month is: per date,
    // the spans already taken and how many of each service are booked. Like bookedSlots,
    // never a patient's detail, so any signed-in user may ask.
    if (req.query.availability) {
      const from = q("from");
      const to = q("to");
      const dentistId = q("dentistId");
      const dentistName = q("dentistName");
      const excludeId = q("excludeId");
      const DAY = /^\d{4}-\d{2}-\d{2}$/;
      if (!from || !to || !DAY.test(from) || !DAY.test(to) || (!dentistId && !dentistName)) {
        return res.status(400).json({ error: "from, to and dentistId or dentistName are required" });
      }
      if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) {
        return res.status(400).json({ error: "Ask for at most two months at a time" });
      }
      const rows = await sql`
        SELECT date, time, end_time, service /* month-availability */ FROM appointments
        WHERE date BETWEEN ${from} AND ${to}
          AND status = ANY(${HOLDING}::text[])
          AND (dentist_id = ${dentistId} OR dentist_name = ${dentistName})
          AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)`;
      const days: Record<string, { slots: { time: string; endTime: string | null }[]; services: Record<string, number> }> = {};
      for (const r of rows as { date: unknown; time: string; end_time: string | null; service: string }[]) {
        const day = (days[isoDate(r.date)] ??= { slots: [], services: {} });
        day.slots.push({ time: r.time, endTime: r.end_time });
        for (const name of new Set(servicesOf(r.service))) day.services[name] = (day.services[name] ?? 0) + 1;
      }
      return res.status(200).json({ days });
    }

    // Patients only ever see their own appointments, so they can't tell from that list
    // which times someone else already holds. This returns just the taken times — no
    // names or details — so any signed-in user can see what's free.
    if (req.query.bookedSlots) {
      const date = q("date");
      const dentistId = q("dentistId");
      const dentistName = q("dentistName");
      const excludeId = q("excludeId");
      if (!date || (!dentistId && !dentistName)) {
        return res.status(400).json({ error: "date and dentistId or dentistName are required" });
      }
      const rows = await sql`
        SELECT DISTINCT time, end_time /* booked-slots */ FROM appointments
        WHERE date = ${date}
          AND status = ANY(${HOLDING}::text[])
          AND (dentist_id = ${dentistId} OR dentist_name = ${dentistName})
          AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)`;
      // Spans, so the booking form can tell whether a longer visit still fits. Never
      // any patient detail: this is answered for whoever is booking.
      const slots = (rows as { time: string; end_time: string | null }[])
        .map(r => ({ time: r.time, endTime: r.end_time }));
      return res.status(200).json({ times: slots.map(s => s.time), slots });
    }

    if (id) {
      const rows = await sql`SELECT * FROM appointments WHERE id = ${id}`;
      const appt = rows[0];
      if (!appt) return res.status(404).json({ error: "Appointment not found" });
      if (session.role === "patient" && appt.patient_id !== session.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return res.status(200).json({ appointment: mapRow(appt) });
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      conditions.push(`${col} = $${params.length}`);
    };

    if (session.role === "patient") {
      push("patient_id", session.sub);
    } else if (typeof req.query.patientId === "string") {
      push("patient_id", req.query.patientId);
    }
    if (typeof req.query.dentistId === "string") push("dentist_id", req.query.dentistId);
    if (typeof req.query.date === "string") push("date", req.query.date);
    if (typeof req.query.status === "string") push("status", req.query.status);
    if (typeof req.query.type === "string") push("type", req.query.type);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await sql.query(`SELECT * FROM appointments ${where} ORDER BY date DESC, time DESC`, params);
    return res.status(200).json({ appointments: (rows as any[]).map(mapRow) });
  }

  if (req.method === "POST") {
    const { patientName, contact, email, age, gender, dentistId, dentistName, service, date, time, endTime, type, reason } = req.body ?? {};
    if (!patientName || !service || !date || !time || !type) {
      return res.status(400).json({ error: "Missing required appointment fields" });
    }
    const patientId = session.role === "patient" ? session.sub : (req.body?.patientId ?? null);
    const status = type === "walk-in" ? "confirmed" : "pending";
    const createdBy = session.role === "patient" ? "patient" : session.role;
    if (session.role === "patient" && tooSoon(date, time)) return res.status(409).json({ error: TOO_SOON });
    // The booking pages only offer free slots, but two people can pick the same one at
    // once, and the API can be called directly — so the server has the final word.
    if (await slotTaken({ dentistId: dentistId ?? null, dentistName: dentistName ?? null, date, time, endTime: endTime ?? null })) {
      return res.status(409).json({ error: SLOT_TAKEN });
    }
    // The dentist has to offer the service, and takes only so many of some in a day.
    const unoffered = await notOffered({ dentistId: dentistId ?? null, dentistName: dentistName ?? null, service });
    if (unoffered) return res.status(409).json({ error: unoffered });
    const full = await overLimit({ dentistId: dentistId ?? null, dentistName: dentistName ?? null, date, service });
    if (full) return res.status(409).json({ error: full });
    // Some services are kept for certain days or hours (e.g. Veneers only Mon & Wed mornings).
    const offHours = await outsideServiceHours({
      dentistId: dentistId ?? null, dentistName: dentistName ?? null, date, time, endTime: endTime ?? null, service,
    });
    if (offHours) return res.status(409).json({ error: offHours });
    // The same patient can't take the same service twice in one day.
    const twice = await sameServiceSameDay({ patientId, patientName, contact: contact ?? null, date, service });
    if (twice) return res.status(409).json({ error: twice });
    await ensureGuestColumns();
    await ensureCodes("appointments");
    const inserted = await sql`
      INSERT INTO appointments (patient_id, patient_name, contact, email, age, gender, dentist_id, dentist_name, service, date, time, end_time, type, status, reason, created_by)
      VALUES (${patientId}, ${patientName}, ${contact ?? null}, ${email ?? null}, ${age ?? null}, ${gender ?? null}, ${dentistId ?? null}, ${dentistName ?? null}, ${service}, ${date}, ${time}, ${endTime ?? null}, ${type}, ${status}, ${reason ?? null}, ${createdBy})
      RETURNING *
    `;
    // Its reference, numbered after the month's bookings so far; the booking stands without it if this fails.
    const codes = await assignCodes("appointments").catch((err) => {
      console.error("Could not give the appointment its reference", err);
      return new Map<string, string>();
    });
    return res.status(201).json({ appointment: mapRow({ ...inserted[0], reference: codes.get(inserted[0].id) ?? null }) });
  }

  // A guest who walked in without an account has since made one: staff move that guest's
  // walk-ins into it, so the visits (and the dental records written for them, which are
  // found through the appointment) show in the account's history. Only bookings still
  // without an account move, and only that guest's: the same name *and* the same
  // contact number (compared as digits), so a namesake's visits are never swept along.
  //
  // The guest's details are compared with the account's here, by the same rules the
  // Link dialog shows: a clearly different person is refused, and anything short of a
  // clean match needs staff to say how they confirmed who the patient is.
  if (req.method === "PATCH" && req.query.linkGuest === "true") {
    if (session.role !== "admin" && session.role !== "superadmin") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { patientName, contact, patientId, verification } = req.body ?? {};
    const guestDigits = String(contact ?? "").replace(/\D/g, "");
    if (!patientName || !patientId) {
      return res.status(400).json({ error: "patientName and patientId are required" });
    }
    const target = await sql`
      SELECT id, first_name, middle_name, last_name, contact_number, age, birthdate, sex /* link-target */
      FROM patients WHERE id = ${patientId}`;
    const account = target[0];
    if (!account) return res.status(404).json({ error: "Patient account not found" });
    const visits = await sql`
      SELECT contact, age, gender /* link-guest-details */ FROM appointments
      WHERE patient_id IS NULL AND patient_name = ${patientName}
        AND regexp_replace(coalesce(contact, ''), '[^0-9]', '', 'g') = ${guestDigits}
      ORDER BY date DESC, time DESC`;
    if (visits.length === 0) {
      return res.status(404).json({ error: "No walk-ins without an account under that name and contact number" });
    }

    // The guest's details as the desk last recorded them (newest visit first).
    type Visit = { contact: string | null; age: number | null; gender: string | null };
    const latest = <K extends keyof Visit>(key: K): Visit[K] | null =>
      (visits as Visit[]).find(v => v[key] != null && v[key] !== "")?.[key] ?? null;
    const { fields, verdict, anyDiffers } = assessLink(
      { name: patientName, contact: latest("contact"), age: latest("age"), gender: latest("gender") },
      {
        name: joinName(account.first_name, account.middle_name, account.last_name),
        contact: account.contact_number,
        age: ageFrom(manilaDateStr(account.birthdate)) ?? account.age,
        gender: account.sex,
      },
    );
    if (verdict === "blocked") {
      return res.status(409).json({
        error: "The name and contact number don't match this account, so it can't be linked. This looks like a different person.",
        verdict, fields,
      });
    }
    if (verdict === "verify") {
      const method = verification?.method;
      const reason = String(verification?.reason ?? "").trim();
      if (typeof method !== "string" || !Object.prototype.hasOwnProperty.call(VERIFICATION_METHODS, method) || verification?.confirmed !== true) {
        return res.status(409).json({
          error: "The details don't fully match. Confirm the patient's identity (their logged-in Profile or a valid ID) before linking.",
          verdict, fields,
        });
      }
      if (anyDiffers && reason.length < MIN_REASON_LENGTH) {
        return res.status(409).json({
          error: "Some details are different. Explain why this is still the same patient before linking.",
          verdict, fields,
        });
      }
    }

    const linked = await sql`
      UPDATE appointments /* link-guest */ SET patient_id = ${patientId}, updated_at = now()
      WHERE patient_id IS NULL AND patient_name = ${patientName}
        AND regexp_replace(coalesce(contact, ''), '[^0-9]', '', 'g') = ${guestDigits}
      RETURNING id`;
    return res.status(200).json({ linked: linked.length, verdict });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const existingRows = await sql`SELECT * FROM appointments WHERE id = ${id}`;
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: "Appointment not found" });
    if (session.role === "patient" && existing.patient_id !== session.sub) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { status: requestedStatus, date, time, reason, remarks, dentistId, dentistName } = req.body ?? {};
    // A patient moving their own appointment is asking, not deciding: it goes back into
    // the clinic's queue for approval instead of standing as an approved booking. Staff
    // rescheduling on the patient's behalf is the clinic's own decision, so it stands.
    const patientRescheduling = session.role === "patient" && requestedStatus === "rescheduled";
    const status = patientRescheduling ? "pending" : requestedStatus;
    // A move keeps the visit as long as it already was, so the end time travels with it.
    const nextEndTime: string | null = req.body?.endTime
      ?? (time && existing.end_time
        ? toTime(toMinutes(time) + (toMinutes(existing.end_time) - toMinutes(existing.time)))
        : null);

    // A request whose time came and went unapproved is closed for good: the patient books again.
    if (status === "confirmed" && existing.status === "rejected" && existing.reason === EXPIRED_REASON) {
      return res.status(409).json({
        error: "This request's time passed before it was approved, so it can't be approved now. Ask the patient to book again.",
      });
    }

    // Completing means the consultation happened, which must not happen before the
    // clinic has approved the booking.
    if (status === "completed" && !APPROVED.includes(existing.status)) {
      return res.status(409).json({ error: "Only approved appointments can be completed. Approve it first." });
    }

    const next = {
      status: status ?? existing.status,
      date: date ?? isoDate(existing.date),
      time: time ?? existing.time,
      dentistId: dentistId ?? existing.dentist_id,
      dentistName: dentistName ?? existing.dentist_name,
    };
    const moving = next.date !== isoDate(existing.date) || next.time !== existing.time
      || next.dentistId !== existing.dentist_id || next.dentistName !== existing.dentist_name;
    const approving = next.status === "confirmed" && existing.status === "pending";
    // A patient moving their appointment has to move it to another day.
    if (patientRescheduling && next.date === isoDate(existing.date)) {
      return res.status(409).json({ error: SAME_DAY });
    }
    if (session.role === "patient" && moving && tooSoon(next.date, next.time)) {
      return res.status(409).json({ error: TOO_SOON });
    }
    if (HOLDING.includes(next.status) && (moving || approving)) {
      const taken = await slotTaken({
        dentistId: next.dentistId, dentistName: next.dentistName, date: next.date, time: next.time,
        endTime: nextEndTime ?? existing.end_time,
        excludeId: id,
        // A move needs a genuinely free slot; an approval only has to not collide
        // with a booking that's already been approved.
        statuses: moving ? HOLDING : APPROVED,
      });
      if (taken) {
        return res.status(409).json({
          error: moving ? SLOT_TAKEN : "Another approved appointment already holds this time slot. Reject this request or ask the patient to reschedule.",
        });
      }
      // Moving onto another day (or dentist) needs room for its procedures there too.
      // An approval leaves the day's count as it was: a pending request already counts.
      const changesDay = next.date !== isoDate(existing.date)
        || next.dentistId !== existing.dentist_id || next.dentistName !== existing.dentist_name;
      // Handing it to another dentist: they have to offer what it's for.
      if (next.dentistId !== existing.dentist_id || next.dentistName !== existing.dentist_name) {
        const unoffered = await notOffered({ dentistId: next.dentistId, dentistName: next.dentistName, service: existing.service });
        if (unoffered) return res.status(409).json({ error: unoffered });
      }
      if (changesDay) {
        const full = await overLimit({
          dentistId: next.dentistId, dentistName: next.dentistName, date: next.date,
          service: existing.service, excludeId: id,
        });
        if (full) return res.status(409).json({ error: full });
      }
      // The same patient can't take the same service twice in one day.
      if (next.date !== isoDate(existing.date)) {
        const twice = await sameServiceSameDay({
          patientId: existing.patient_id, patientName: existing.patient_name, contact: existing.contact,
          date: next.date, service: existing.service, excludeId: id,
        });
        if (twice) return res.status(409).json({ error: twice });
      }
      if (moving) {
        const offHours = await outsideServiceHours({
          dentistId: next.dentistId, dentistName: next.dentistName, date: next.date, time: next.time,
          endTime: nextEndTime ?? existing.end_time ?? null, service: existing.service,
        });
        if (offHours) return res.status(409).json({ error: offHours });
      }
    }

    // Counted on the request, so a patient still only gets the one move.
    const rescheduleIncrement = requestedStatus === "rescheduled" ? 1 : 0;
    const updated = await sql`
      UPDATE appointments SET
        status = COALESCE(${status ?? null}, status),
        date = COALESCE(${date ?? null}, date),
        time = COALESCE(${time ?? null}, time),
        end_time = COALESCE(${nextEndTime}, end_time),
        reason = COALESCE(${reason ?? null}, reason),
        remarks = COALESCE(${remarks ?? null}, remarks),
        dentist_id = COALESCE(${dentistId ?? null}, dentist_id),
        dentist_name = COALESCE(${dentistName ?? null}, dentist_name),
        reschedule_count = reschedule_count + ${rescheduleIncrement},
        updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    const updatedRow = updated[0];

    // null = no email was due (status unchanged, or no address on file); otherwise
    // whether it actually sent. Returned so the UI can say what really happened
    // instead of always claiming success.
    let emailSent: boolean | null = null;
    if (status && status !== existing.status && NOTIFY_STATUSES.has(status) && updatedRow.email) {
      const message = status === "confirmed"
        ? "Please arrive 10 minutes early and bring a valid ID."
        : [updatedRow.reason, updatedRow.remarks].filter(Boolean).join(" — ");
      // Awaited (not fire-and-forget): Vercel can freeze the function as soon as the response is
      // sent, which would silently kill an un-awaited email send before it completes.
      try {
        await sendAppointmentEmail({
          email: updatedRow.email,
          status,
          patientName: updatedRow.patient_name,
          service: displayService(updatedRow.service),
          dentistName: updatedRow.dentist_name,
          date: new Date(updatedRow.date).toISOString().slice(0, 10),
          time: updatedRow.time,
          message,
        });
        emailSent = true;
      } catch (err) {
        console.error("Appointment email failed:", err);
        emailSent = false;
      }
    }

    return res.status(200).json({ appointment: mapRow(updatedRow), emailSent });
  }

  if (req.method === "DELETE") {
    if (session.role === "patient") return res.status(403).json({ error: "Forbidden" });
    await sql`DELETE FROM appointments WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
