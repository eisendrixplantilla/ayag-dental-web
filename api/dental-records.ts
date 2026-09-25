import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";
import { displayService, legacyNames } from "./_lib/services.js";
import { manilaDateStr } from "./_lib/date.js";

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
      .map((t) => ({ id: t.id, serviceId: t.service_id, serviceName: displayService(t.service_name) })),
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
  // Match the old spelling too, so a corrected name reuses its row rather than
  // creating a near-duplicate next to it.
  const names = [trimmed, ...legacyNames(trimmed)];
  const existing = await sql`SELECT id FROM services WHERE service_name = ANY(${names}::text[])`;
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

const SERVICE_COLUMNS = `id, service_name AS name, description, duration, price,
  removed_at, removed_by, removed_reason, sort_order`;

function mapService(r: any) {
  return {
    id: r.id,
    name: displayService(r.name),
    description: r.description,
    duration: r.duration,
    price: r.price,
    removedAt: manilaDateStr(r.removed_at),
    removedBy: r.removed_by,
    removedReason: r.removed_reason,
    sortOrder: r.sort_order,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  if (req.method === "GET") {
    if (req.query.services === "true") {
      // Removed services are kept out of the catalogue everything else reads from; the
      // Settings page asks for them separately to show why each one went.
      const removed = req.query.removed === "true";
      const rows = removed
        ? await sql.query(`SELECT ${SERVICE_COLUMNS} FROM services WHERE removed_at IS NOT NULL ORDER BY removed_at DESC`, [])
        : await sql.query(`SELECT ${SERVICE_COLUMNS} FROM services WHERE removed_at IS NULL ORDER BY sort_order NULLS LAST, service_name`, []);
      return res.status(200).json({ services: (rows as any[]).map(mapService) });
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

  if (req.method === "PATCH" && req.query.services === "true") {
    if (session.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });

    if (req.body?.action === "reorder") {
      const order = Array.isArray(req.body?.order) ? req.body.order.filter((v: unknown) => typeof v === "string") : [];
      if (order.length === 0) return res.status(400).json({ error: "An order is required" });
      // One statement, so the list can never be left half-renumbered.
      await sql.query(
        `UPDATE services SET sort_order = o.pos
         FROM (SELECT * FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id, pos)) o
         WHERE services.id = o.id`,
        [order],
      );
      const rows = await sql.query(
        `SELECT ${SERVICE_COLUMNS} FROM services WHERE removed_at IS NULL ORDER BY sort_order NULLS LAST, service_name`, [],
      );
      return res.status(200).json({ services: (rows as any[]).map(mapService) });
    }

    if (!id) return res.status(400).json({ error: "Missing id" });
    const { price, duration, action, reason, removedBy } = req.body ?? {};

    if (action === "remove") {
      // A reason is required: the catalogue has to say why a service stopped being offered.
      const removedReason = typeof reason === "string" ? reason.trim() : "";
      if (!removedReason) return res.status(400).json({ error: "A reason is required to remove a service" });
      await sql`
        UPDATE services SET removed_at = now(), removed_by = ${removedBy ?? "Super Admin"}, removed_reason = ${removedReason}
        WHERE id = ${id}
      `;
    } else if (action === "restore") {
      await sql`UPDATE services SET removed_at = NULL, removed_by = NULL, removed_reason = NULL WHERE id = ${id}`;
    } else {
      await sql`UPDATE services SET price = COALESCE(${price ?? null}, price), duration = COALESCE(${duration ?? null}, duration) WHERE id = ${id}`;
    }

    const rows = await sql.query(`SELECT ${SERVICE_COLUMNS} FROM services WHERE id = $1`, [id]);
    const service = (rows as any[])[0];
    if (!service) return res.status(404).json({ error: "Service not found" });
    return res.status(200).json({ service: mapService(service) });
  }

  // Taking a service out of the catalogue for good. Only one already removed, and
  // only one nothing points at: a service named by a treatment is part of what that
  // record says happened, and deleting it would quietly rewrite the record.
  if (req.method === "DELETE" && req.query.services === "true") {
    if (session.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    if (!id) return res.status(400).json({ error: "Missing id" });

    const found = await sql`SELECT service_name, removed_at FROM services WHERE id = ${id}`;
    const service = found[0];
    if (!service) return res.status(404).json({ error: "Service not found" });
    if (!service.removed_at) {
      return res.status(409).json({ error: "Remove the service first — only a removed service can be deleted for good." });
    }

    // Which records would lose a line — named, so the Super Admin decides knowing
    // exactly what goes with it rather than being told only that something does.
    const blocking = await sql`
      SELECT dr.id, dr.date, dr.diagnosis,
             COALESCE(p.first_name || ' ' || p.last_name, a.patient_name) AS patient_name
      FROM treatments t
      JOIN dental_records dr ON dr.id = t.record_id
      JOIN appointments a ON a.id = dr.appointment_id
      LEFT JOIN patients p ON p.id = a.patient_id
      WHERE t.service_id = ${id}
      ORDER BY dr.date DESC
    `;

    if (blocking.length > 0 && req.query.withRecords !== "true") {
      const n = blocking.length;
      return res.status(409).json({
        error: `"${displayService(service.service_name)}" is named by ${n} dental record${n === 1 ? "" : "s"}. Deleting it would change what ${n === 1 ? "that record says" : "those records say"}, so it stays in Removed Services.`,
        records: blocking.map((r: any) => ({
          id: r.id,
          date: toDateStr(r.date),
          diagnosis: r.diagnosis,
          patientName: r.patient_name,
        })),
      });
    }

    // Asked for explicitly, knowing which records go with it. Each record's own
    // treatments and prescriptions follow it out, which the foreign keys cascade.
    for (const r of blocking as any[]) {
      await sql`DELETE FROM dental_records WHERE id = ${r.id}`;
    }
    await sql`DELETE FROM services WHERE id = ${id}`;
    return res.status(200).json({ ok: true, deletedRecords: blocking.length });
  }

  if (req.method === "POST" && req.query.services === "true") {
    if (session.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    const { name, duration, price, description } = req.body ?? {};
    const serviceName = typeof name === "string" ? name.trim() : "";
    if (!serviceName) return res.status(400).json({ error: "Service name is required" });

    // One row per service: the name is what booking forms and records match on. A name
    // that belongs to a removed service is its own case — adding it again would leave two
    // rows answering to the same name, so the Super Admin is sent to restore it instead.
    const existing = await sql`
      SELECT id, removed_at FROM services WHERE lower(service_name) = ${serviceName.toLowerCase()}
    `;
    if (existing.length > 0) {
      return res.status(409).json({
        error: existing[0].removed_at
          ? `"${serviceName}" was removed earlier. Restore it under Removed Services instead.`
          : "A service with this name already exists",
      });
    }

    const inserted = await sql.query(
      `INSERT INTO services (service_name, description, duration, price, sort_order)
       VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM services)) RETURNING ${SERVICE_COLUMNS}`,
      [serviceName, description ?? null, duration ?? null, price ?? null],
    );
    return res.status(201).json({ service: mapService((inserted as any[])[0]) });
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
