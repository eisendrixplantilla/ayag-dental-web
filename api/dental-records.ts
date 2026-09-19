import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";

function toDateStr(v: unknown): string | null {
  if (v == null) return null;
  return new Date(v as string).toISOString().slice(0, 10);
}

function mapRecord(r: any, treatments: any[], prescriptions: any[]) {
  return {
    id: r.id,
    appointmentId: r.appointment_id,
    patientId: r.apt_patient_id ?? null,
    patientName: r.apt_patient_name ?? r.patient_name ?? null,
    dentistId: r.apt_dentist_id ?? null,
    dentistName: r.apt_dentist_name ?? null,
    date: toDateStr(r.date),
    diagnosis: r.diagnosis,
    toothNumber: r.tooth_number,
    treatmentNotes: r.treatment_notes,
    nextVisit: toDateStr(r.next_visit),
    createdAt: r.created_at,
    treatments: treatments
      .filter((t) => t.record_id === r.id)
      .map((t) => ({ id: t.id, serviceId: t.service_id, serviceName: t.service_name })),
    prescriptions: prescriptions
      .filter((p) => p.record_id === r.id)
      .map((p) => ({ id: p.id, medicine: p.medicine, dosage: p.dosage, instructions: p.instructions })),
  };
}

async function loadTreatmentsAndPrescriptions(recordIds: string[]) {
  if (recordIds.length === 0) return { treatments: [], prescriptions: [] };
  const [treatments, prescriptions] = await Promise.all([
    sql.query(
      `SELECT t.id, t.record_id, t.service_id, s.service_name FROM treatments t LEFT JOIN services s ON s.id = t.service_id WHERE t.record_id = ANY($1)`,
      [recordIds],
    ),
    sql.query(`SELECT id, record_id, medicine, dosage, instructions FROM prescriptions WHERE record_id = ANY($1)`, [recordIds]),
  ]);
  return { treatments: treatments as any[], prescriptions: prescriptions as any[] };
}

async function findOrCreateService(name: string): Promise<string> {
  const trimmed = name.trim();
  const existing = await sql`SELECT id FROM services WHERE service_name = ${trimmed}`;
  if (existing[0]) return existing[0].id;
  const inserted = await sql`INSERT INTO services (service_name) VALUES (${trimmed}) RETURNING id`;
  return inserted[0].id;
}

async function replaceTreatmentsAndPrescriptions(
  recordId: string,
  treatments: { serviceId?: string; serviceName?: string }[] | undefined,
  prescriptions: { medicine: string; dosage?: string; instructions?: string }[] | undefined,
) {
  if (treatments) {
    await sql`DELETE FROM treatments WHERE record_id = ${recordId}`;
    for (const t of treatments) {
      const serviceId = t.serviceId ?? (t.serviceName ? await findOrCreateService(t.serviceName) : null);
      if (serviceId) await sql`INSERT INTO treatments (record_id, service_id) VALUES (${recordId}, ${serviceId})`;
    }
  }
  if (prescriptions) {
    await sql`DELETE FROM prescriptions WHERE record_id = ${recordId}`;
    for (const p of prescriptions) {
      if (!p.medicine?.trim()) continue;
      await sql`INSERT INTO prescriptions (record_id, medicine, dosage, instructions) VALUES (${recordId}, ${p.medicine.trim()}, ${p.dosage ?? null}, ${p.instructions ?? null})`;
    }
  }
}

const RECORD_SELECT = `
  SELECT dr.*, a.patient_id AS apt_patient_id, a.patient_name AS apt_patient_name,
         a.dentist_id AS apt_dentist_id, a.dentist_name AS apt_dentist_name
  FROM dental_records dr
  JOIN appointments a ON a.id = dr.appointment_id
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  if (req.method === "GET") {
    if (req.query.services === "true") {
      const rows = await sql`SELECT id, service_name AS name, description FROM services ORDER BY service_name`;
      return res.status(200).json({ services: rows });
    }

    if (id) {
      const rows = await sql.query(`${RECORD_SELECT} WHERE dr.id = $1`, [id]);
      const record = (rows as any[])[0];
      if (!record) return res.status(404).json({ error: "Dental record not found" });
      if (session.role === "patient" && record.apt_patient_id !== session.sub) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { treatments, prescriptions } = await loadTreatmentsAndPrescriptions([record.id]);
      return res.status(200).json({ record: mapRecord(record, treatments, prescriptions) });
    }

    const conditions: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, val: unknown) => {
      params.push(val);
      conditions.push(`${col} = $${params.length}`);
    };

    if (session.role === "patient") {
      push("a.patient_id", session.sub);
    } else if (typeof req.query.patientId === "string") {
      push("a.patient_id", req.query.patientId);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await sql.query(`${RECORD_SELECT} ${where} ORDER BY dr.date DESC, dr.created_at DESC`, params);
    const recordRows = rows as any[];
    const { treatments, prescriptions } = await loadTreatmentsAndPrescriptions(recordRows.map((r) => r.id));
    return res.status(200).json({ records: recordRows.map((r) => mapRecord(r, treatments, prescriptions)) });
  }

  if (session.role === "patient") return res.status(403).json({ error: "Forbidden" });

  if (req.method === "POST") {
    const { appointmentId, date, diagnosis, toothNumber, treatmentNotes, nextVisit, treatments, prescriptions } = req.body ?? {};
    if (!appointmentId || !diagnosis) {
      return res.status(400).json({ error: "Appointment and diagnosis are required" });
    }
    const apptRows = await sql`SELECT id, date FROM appointments WHERE id = ${appointmentId}`;
    if (!apptRows[0]) return res.status(400).json({ error: "Appointment not found" });

    const inserted = await sql`
      INSERT INTO dental_records (appointment_id, date, diagnosis, tooth_number, treatment_notes, next_visit)
      VALUES (${appointmentId}, ${date ?? apptRows[0].date}, ${diagnosis}, ${toothNumber ?? null}, ${treatmentNotes ?? null}, ${nextVisit ?? null})
      RETURNING id
    `;
    const recordId = inserted[0].id;
    await replaceTreatmentsAndPrescriptions(recordId, treatments, prescriptions);

    const rows = await sql.query(`${RECORD_SELECT} WHERE dr.id = $1`, [recordId]);
    const { treatments: t, prescriptions: p } = await loadTreatmentsAndPrescriptions([recordId]);
    return res.status(201).json({ record: mapRecord((rows as any[])[0], t, p) });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const { diagnosis, toothNumber, treatmentNotes, nextVisit, treatments, prescriptions } = req.body ?? {};

    const existingRows = await sql`SELECT id FROM dental_records WHERE id = ${id}`;
    if (!existingRows[0]) return res.status(404).json({ error: "Dental record not found" });

    await sql`
      UPDATE dental_records SET
        diagnosis = COALESCE(${diagnosis ?? null}, diagnosis),
        tooth_number = COALESCE(${toothNumber ?? null}, tooth_number),
        treatment_notes = COALESCE(${treatmentNotes ?? null}, treatment_notes),
        next_visit = COALESCE(${nextVisit ?? null}, next_visit),
        updated_at = now()
      WHERE id = ${id}
    `;
    await replaceTreatmentsAndPrescriptions(id, treatments, prescriptions);

    const rows = await sql.query(`${RECORD_SELECT} WHERE dr.id = $1`, [id]);
    const { treatments: t, prescriptions: p } = await loadTreatmentsAndPrescriptions([id]);
    return res.status(200).json({ record: mapRecord((rows as any[])[0], t, p) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
