import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sql } from "../_lib/db.js";
import { getSessionFromRequest } from "../_lib/auth.js";

const PATIENT_FIELDS = `
  u.id, u.email, u.name, u.role, u.verified, u.created_at,
  p.phone, p.address, p.age, p.gender, p.blood_type AS "bloodType", p.allergies,
  p.status, p.last_login AS "lastLogin", p.archived_at AS "archivedAt", p.archived_by AS "archivedBy"
`;

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
    if (!requireSession(req, res)) return;

    if (id) {
      const rows = await sql.query(
        `SELECT ${PATIENT_FIELDS} FROM users u JOIN patient_profiles p ON p.user_id = u.id WHERE u.id = $1`,
        [id],
      );
      const patient = (rows as any[])[0];
      if (!patient) return res.status(404).json({ error: "Patient not found" });
      const [apptCount, recordCount] = await Promise.all([
        sql`SELECT COUNT(*)::int AS c FROM appointments WHERE patient_id = ${id}`,
        sql`SELECT COUNT(*)::int AS c FROM dental_records WHERE patient_id = ${id}`,
      ]);
      return res.status(200).json({
        patient: { ...patient, appointmentsCount: apptCount[0].c, dentalRecordsCount: recordCount[0].c },
      });
    }

    const archived = req.query.archived === "true";
    const rows = archived
      ? await sql.query(`SELECT ${PATIENT_FIELDS} FROM users u JOIN patient_profiles p ON p.user_id = u.id WHERE p.archived_at IS NOT NULL ORDER BY u.name`, [])
      : await sql.query(`SELECT ${PATIENT_FIELDS} FROM users u JOIN patient_profiles p ON p.user_id = u.id WHERE p.archived_at IS NULL ORDER BY u.name`, []);
    return res.status(200).json({ patients: rows });
  }

  if (req.method === "POST") {
    if (!requireStaff(req, res)) return;
    const { name, email, phone, address, age, gender, bloodType, allergies } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`;
    if (existing.length > 0) return res.status(409).json({ error: "A user with this email already exists" });

    const passwordHash = await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10);
    const inserted = await sql`
      INSERT INTO users (email, password_hash, name, role, verified)
      VALUES (${normalizedEmail}, ${passwordHash}, ${name}, 'patient', TRUE)
      RETURNING id, email, name, role, verified, created_at
    `;
    const user = inserted[0];
    await sql`
      INSERT INTO patient_profiles (user_id, phone, address, age, gender, blood_type, allergies)
      VALUES (${user.id}, ${phone ?? null}, ${address ?? null}, ${age ?? null}, ${gender ?? null}, ${bloodType ?? null}, ${allergies ?? null})
    `;
    return res.status(201).json({
      patient: { ...user, phone: phone ?? null, address: address ?? null, age: age ?? null, gender: gender ?? null, bloodType: bloodType ?? null, allergies: allergies ?? null, status: "active", lastLogin: null },
    });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const { action, name, phone, address, age, gender, bloodType, allergies, status, archivedBy } = req.body ?? {};

    if (action === "archive" || action === "restore") {
      if (!requireStaff(req, res)) return;
      if (action === "archive") {
        await sql`UPDATE patient_profiles SET archived_at = now(), archived_by = ${archivedBy ?? "Admin"}, status = 'inactive' WHERE user_id = ${id}`;
      } else {
        await sql`UPDATE patient_profiles SET archived_at = NULL, archived_by = NULL, status = 'active' WHERE user_id = ${id}`;
      }
    } else {
      const session = getSessionFromRequest(req);
      const isSelf = session?.role === "patient" && session.sub === id;
      const isStaff = session?.role === "admin" || session?.role === "superadmin";
      if (!session || (!isSelf && !isStaff)) return res.status(401).json({ error: "Unauthorized" });
      if (!isStaff && status) return res.status(403).json({ error: "Forbidden" });

      if (name) await sql`UPDATE users SET name = ${name} WHERE id = ${id}`;
      await sql`
        UPDATE patient_profiles SET
          phone = COALESCE(${phone ?? null}, phone),
          address = COALESCE(${address ?? null}, address),
          age = COALESCE(${age ?? null}, age),
          gender = COALESCE(${gender ?? null}, gender),
          blood_type = COALESCE(${bloodType ?? null}, blood_type),
          allergies = COALESCE(${allergies ?? null}, allergies),
          status = COALESCE(${status ?? null}, status)
        WHERE user_id = ${id}
      `;
    }

    const rows = await sql.query(
      `SELECT ${PATIENT_FIELDS} FROM users u JOIN patient_profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [id],
    );
    return res.status(200).json({ patient: (rows as any[])[0] });
  }

  if (req.method === "DELETE") {
    if (!requireStaff(req, res)) return;
    const [apptCount, recordCount] = await Promise.all([
      sql`SELECT COUNT(*)::int AS c FROM appointments WHERE patient_id = ${id}`,
      sql`SELECT COUNT(*)::int AS c FROM dental_records WHERE patient_id = ${id}`,
    ]);
    if (apptCount[0].c > 0 || recordCount[0].c > 0) {
      return res.status(400).json({ error: "This account has existing appointments or dental records and cannot be deleted." });
    }
    await sql`DELETE FROM users WHERE id = ${id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
