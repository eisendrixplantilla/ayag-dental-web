import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";
import { sendAppointmentEmail } from "./_lib/email.js";

const NOTIFY_STATUSES = new Set(["confirmed", "rejected", "cancelled", "rescheduled"]);

function mapRow(r: any) {
  return {
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    contact: r.contact,
    email: r.email,
    dentistId: r.dentist_id,
    dentistName: r.dentist_name,
    service: r.service,
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
    const { patientName, contact, email, dentistId, dentistName, service, date, time, type, reason } = req.body ?? {};
    if (!patientName || !service || !date || !time || !type) {
      return res.status(400).json({ error: "Missing required appointment fields" });
    }
    const patientId = session.role === "patient" ? session.sub : (req.body?.patientId ?? null);
    const status = type === "walk-in" ? "confirmed" : "pending";
    const createdBy = session.role === "patient" ? "patient" : session.role;
    const inserted = await sql`
      INSERT INTO appointments (patient_id, patient_name, contact, email, dentist_id, dentist_name, service, date, time, type, status, reason, created_by)
      VALUES (${patientId}, ${patientName}, ${contact ?? null}, ${email ?? null}, ${dentistId ?? null}, ${dentistName ?? null}, ${service}, ${date}, ${time}, ${type}, ${status}, ${reason ?? null}, ${createdBy})
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

    const { status, date, time, reason, remarks, dentistId, dentistName } = req.body ?? {};
    const rescheduleIncrement = status === "rescheduled" ? 1 : 0;
    const updated = await sql`
      UPDATE appointments SET
        status = COALESCE(${status ?? null}, status),
        date = COALESCE(${date ?? null}, date),
        time = COALESCE(${time ?? null}, time),
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
          service: updatedRow.service,
          dentistName: updatedRow.dentist_name,
          date: new Date(updatedRow.date).toISOString().slice(0, 10),
          time: updatedRow.time,
          message,
        });
      } catch (err) {
        console.error("Appointment email failed:", err);
      }
    }

    return res.status(200).json({ appointment: mapRow(updatedRow) });
  }

  if (req.method === "DELETE") {
    if (session.role === "patient") return res.status(403).json({ error: "Forbidden" });
    await sql`DELETE FROM appointments WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
