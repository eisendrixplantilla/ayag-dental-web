import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sql } from "../_lib/db.js";
import { getSessionFromRequest } from "../_lib/auth.js";
import { splitName, joinName } from "../_lib/name.js";
import { manilaDateStr } from "../_lib/date.js";

function mapPatient(p: any, counts?: { appointmentsCount: number; dentalRecordsCount: number }) {
  return {
    id: p.id,
    email: p.email,
    name: joinName(p.first_name, p.middle_name, p.last_name),
    firstName: p.first_name,
    middleName: p.middle_name,
    lastName: p.last_name,
    role: "patient",
    verified: p.verified,
    phone: p.contact_number,
    address: p.address,
    // Collected at registration and stored ever since, but until now nothing read it back.
    birthdate: manilaDateStr(p.birthdate),
    age: p.age,
    gender: p.sex,
    bloodType: p.blood_type,
    allergies: p.allergies,
    status: p.status,
    photoUrl: p.photo_url,
    lastLogin: p.last_login,
    createdAt: manilaDateStr(p.created_at),
    archivedAt: manilaDateStr(p.archived_at),
    archivedBy: p.archived_by,
    ...(counts ? counts : {}),
  };
}

function requireStaff(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session || (session.role !== "admin" && session.role !== "superadmin")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

function requireSession(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  if (req.method === "GET") {
    const session = requireSession(req, res);
    if (!session) return;
    // A patient row carries an address, allergies and a blood type. Staff read any of them;
    // a patient reads their own and nobody else's. Only the Profile page asks as a patient.
    const isClinician = session.role === "admin" || session.role === "superadmin" || session.role === "dentist";
    if (!isClinician && session.sub !== id) return res.status(403).json({ error: "Forbidden" });

    if (id) {
      const rows = await sql`SELECT * FROM patients WHERE id = ${id}`;
      const patient = rows[0];
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      const [apptCount, recordCount] = await Promise.all([
        sql`SELECT COUNT(*)::int AS c FROM appointments WHERE patient_id = ${id}`,
        sql`SELECT COUNT(*)::int AS c FROM dental_records dr JOIN appointments a ON a.id = dr.appointment_id WHERE a.patient_id = ${id}`,
      ]);
      return res.status(200).json({
        patient: mapPatient(patient, { appointmentsCount: apptCount[0].c, dentalRecordsCount: recordCount[0].c }),
      });
    }

    const archived = req.query.archived === "true";
    const rows = archived
      ? await sql`SELECT * FROM patients WHERE archived_at IS NOT NULL ORDER BY first_name, last_name`
      : await sql`SELECT * FROM patients WHERE archived_at IS NULL ORDER BY first_name, last_name`;
    return res.status(200).json({ patients: rows.map((r) => mapPatient(r)) });
  }

  if (req.method === "POST") {
    if (!requireStaff(req, res)) return;
    const { name, email, phone, address, age, gender, bloodType, allergies } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existingPatient, existingUser] = await Promise.all([
      sql`SELECT id FROM patients WHERE lower(email) = ${normalizedEmail}`,
      sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`,
    ]);
    if (existingPatient.length > 0 || existingUser.length > 0) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }

    const { firstName, lastName } = splitName(name);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
    const inserted = await sql`
      INSERT INTO patients (email, password_hash, first_name, last_name, contact_number, address, age, sex, blood_type, allergies, verified)
      VALUES (${normalizedEmail}, ${passwordHash}, ${firstName}, ${lastName}, ${phone ?? null}, ${address ?? null}, ${age ?? null}, ${gender ?? null}, ${bloodType ?? null}, ${allergies ?? null}, TRUE)
      RETURNING *
    `;
    return res.status(201).json({ patient: mapPatient(inserted[0]) });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const { action, name, phone, address, age, gender, bloodType, allergies, status, archivedBy, photo } = req.body ?? {};

    if (action === "archive" || action === "restore") {
      if (!requireStaff(req, res)) return;
      if (action === "archive") {
        await sql`UPDATE patients SET archived_at = now(), archived_by = ${archivedBy ?? "Admin"}, status = 'inactive' WHERE id = ${id}`;
      } else {
        await sql`UPDATE patients SET archived_at = NULL, archived_by = NULL, status = 'active' WHERE id = ${id}`;
      }
    } else {
      const session = getSessionFromRequest(req);
      const isSelf = session?.role === "patient" && session.sub === id;
      const isStaff = session?.role === "admin" || session?.role === "superadmin";
      if (!session || (!isSelf && !isStaff)) return res.status(401).json({ error: "Unauthorized" });
      if (!isStaff && status) return res.status(403).json({ error: "Forbidden" });

      const nameParts = name ? splitName(name) : null;
      await sql`
        UPDATE patients SET
          first_name = COALESCE(${nameParts?.firstName ?? null}, first_name),
          last_name = COALESCE(${nameParts?.lastName ?? null}, last_name),
          contact_number = COALESCE(${phone ?? null}, contact_number),
          address = COALESCE(${address ?? null}, address),
          age = COALESCE(${age ?? null}, age),
          sex = COALESCE(${gender ?? null}, sex),
          blood_type = COALESCE(${bloodType ?? null}, blood_type),
          allergies = COALESCE(${allergies ?? null}, allergies),
          status = COALESCE(${status ?? null}, status),
          photo_url = COALESCE(${photo ?? null}, photo_url),
          updated_at = now()
        WHERE id = ${id}
      `;
    }

    const rows = await sql`SELECT * FROM patients WHERE id = ${id}`;
    if (!rows[0]) return res.status(404).json({ error: "Patient not found" });
    return res.status(200).json({ patient: mapPatient(rows[0]) });
  }

  if (req.method === "DELETE") {
    if (!requireStaff(req, res)) return;
    const [apptCount, recordCount] = await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM appointments WHERE patient_id = ${id}`,
      sql`SELECT COUNT(*)::int AS c FROM dental_records dr JOIN appointments a ON a.id = dr.appointment_id WHERE a.patient_id = ${id}`,
    ]);
    if (apptCount[0].c > 0 || recordCount[0].c > 0) {
      return res.status(400).json({ error: "This account has existing appointments or dental records and cannot be deleted." });
    }
    await sql`DELETE FROM patients WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
