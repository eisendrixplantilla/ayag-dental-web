import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";
import { sendAppointmentEmail } from "./_lib/email.js";
import { displayService } from "./_lib/services.js";

const NOTIFY_STATUSES = new Set(["confirmed", "rejected", "cancelled", "rescheduled"]);

/** Statuses that occupy a dentist's time slot. */
const HOLDING = ["pending", "confirmed", "rescheduled"];
/** Statuses the dentist can act on (consult, reschedule, cancel) — i.e. approved. */
const APPROVED = ["confirmed", "rescheduled"];

const SLOT_TAKEN = "That time slot has already been taken. Please choose another time.";

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

function mapRow(r: any) {
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    contact: r.contact,
    email: r.email,
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  if (req.method === "GET") {
    // Patients only ever see their own appointments, so they can't tell from that list
    // which times someone else already holds. This returns just the taken times — no
    // names or details — so any signed-in user can see what's free.
    if (req.query.bookedSlots) {
      const q = (k: string) => (typeof req.query[k] === "string" && req.query[k] ? String(req.query[k]) : null);
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
    const { patientName, contact, email, dentistId, dentistName, service, date, time, endTime, type, reason } = req.body ?? {};
    if (!patientName || !service || !date || !time || !type) {
      return res.status(400).json({ error: "Missing required appointment fields" });
    }
    const patientId = session.role === "patient" ? session.sub : (req.body?.patientId ?? null);
    const status = type === "walk-in" ? "confirmed" : "pending";
    const createdBy = session.role === "patient" ? "patient" : session.role;
    // The booking pages only offer free slots, but two people can pick the same one at
    // once, and the API can be called directly — so the server has the final word.
    if (await slotTaken({ dentistId: dentistId ?? null, dentistName: dentistName ?? null, date, time, endTime: endTime ?? null })) {
      return res.status(409).json({ error: SLOT_TAKEN });
    }
    const inserted = await sql`
      INSERT INTO appointments (patient_id, patient_name, contact, email, dentist_id, dentist_name, service, date, time, end_time, type, status, reason, created_by)
      VALUES (${patientId}, ${patientName}, ${contact ?? null}, ${email ?? null}, ${dentistId ?? null}, ${dentistName ?? null}, ${service}, ${date}, ${time}, ${endTime ?? null}, ${type}, ${status}, ${reason ?? null}, ${createdBy})
      RETURNING *
    `;
    return res.status(201).json({ appointment: mapRow(inserted[0]) });
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
