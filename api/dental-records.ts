import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";

const CORRECTABLE_FIELDS = ["diagnosis", "procedure", "tooth_number", "treatment_notes", "prescription", "next_visit"] as const;

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  return new Date(v as string).toISOString().slice(0, 10);
}

function mapRecord(r: any) {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    dentistId: r.dentist_id,
    dentistName: r.dentist_name,
    date: toDateStr(r.date),
    service: r.service,
    procedure: r.procedure,
    diagnosis: r.diagnosis,
    toothNumber: r.tooth_number,
    treatmentNotes: r.treatment_notes,
    prescription: r.prescription,
    nextVisit: toDateStr(r.next_visit),
    createdAt: r.created_at,
  };
}

function mapAudit(a: any) {
  return { id: a.id, recordId: a.record_id, editedAt: a.edited_at, reason: a.reason, changes: a.changes };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  if (req.method === "GET") {
    if (id) {
      const rows = await sql`SELECT * FROM dental_records WHERE id = ${id}`;
      const record = rows[0];
      if (!record) return res.status(404).json({ error: "Dental record not found" });
      if (session.role === "patient" && record.patient_id !== session.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const audits = await sql`SELECT * FROM dental_record_audits WHERE record_id = ${id} ORDER BY edited_at ASC`;
      return res.status(200).json({ record: mapRecord(record), audits: audits.map(mapAudit) });
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
    if (typeof req.query.dentistName === "string") push("dentist_name", req.query.dentistName);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await sql.query(`SELECT * FROM dental_records ${where} ORDER BY date DESC, created_at DESC`, params);
    return res.status(200).json({ records: (rows as any[]).map(mapRecord) });
  }

  if (session.role === "patient") return res.status(403).json({ error: "Forbidden" });

  if (req.method === "POST") {
    const {
      appointmentId, patientId, patientName, dentistId, dentistName,
      date, service, procedure, diagnosis, toothNumber, treatmentNotes, prescription, nextVisit,
    } = req.body ?? {};
    if (!patientName || !date || !procedure || !diagnosis) {
      return res.status(400).json({ error: "Patient, date, procedure and diagnosis are required" });
    }
    const inserted = await sql`
      INSERT INTO dental_records (appointment_id, patient_id, patient_name, dentist_id, dentist_name, date, service, procedure, diagnosis, tooth_number, treatment_notes, prescription, next_visit)
      VALUES (${appointmentId ?? null}, ${patientId ?? null}, ${patientName}, ${dentistId ?? null}, ${dentistName ?? null}, ${date}, ${service ?? null}, ${procedure}, ${diagnosis}, ${toothNumber ?? null}, ${treatmentNotes ?? null}, ${prescription ?? null}, ${nextVisit ?? null})
      RETURNING *
    `;
    return res.status(201).json({ record: mapRecord(inserted[0]) });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const { reason, diagnosis, procedure, toothNumber, treatmentNotes, prescription, nextVisit } = req.body ?? {};
    if (!reason || !String(reason).trim()) return res.status(400).json({ error: "A correction reason is required" });

    const existingRows = await sql`SELECT * FROM dental_records WHERE id = ${id}`;
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: "Dental record not found" });

    const incoming: Record<string, unknown> = {
      diagnosis, procedure, tooth_number: toothNumber, treatment_notes: treatmentNotes, prescription, next_visit: nextVisit,
    };
    const changeParts: string[] = [];
    for (const field of CORRECTABLE_FIELDS) {
      const newVal = incoming[field];
      if (newVal === undefined) continue;
      const oldVal = existing[field] ?? "";
      if (String(oldVal) !== String(newVal ?? "")) {
        changeParts.push(`${field}: "${oldVal}" → "${newVal ?? ""}"`);
      }
    }

    const updated = await sql`
      UPDATE dental_records SET
        diagnosis = COALESCE(${diagnosis ?? null}, diagnosis),
        procedure = COALESCE(${procedure ?? null}, procedure),
        tooth_number = COALESCE(${toothNumber ?? null}, tooth_number),
        treatment_notes = COALESCE(${treatmentNotes ?? null}, treatment_notes),
        prescription = COALESCE(${prescription ?? null}, prescription),
        next_visit = COALESCE(${nextVisit ?? null}, next_visit)
      WHERE id = ${id}
      RETURNING *
    `;
    await sql`
      INSERT INTO dental_record_audits (record_id, reason, changes)
      VALUES (${id}, ${reason}, ${changeParts.join("; ") || "No field values changed"})
    `;
    const audits = await sql`SELECT * FROM dental_record_audits WHERE record_id = ${id} ORDER BY edited_at ASC`;
    return res.status(200).json({ record: mapRecord(updated[0]), audits: audits.map(mapAudit) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
