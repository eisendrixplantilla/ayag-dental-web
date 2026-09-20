import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "./_lib/db.js";
import { getSessionFromRequest } from "./_lib/auth.js";
import { splitName, joinName } from "./_lib/name.js";

function mapStaff(u: any) {
  return {
    id: u.id,
    employeeId: u.employee_id,
    name: joinName(u.first_name, u.middle_name, u.last_name),
    email: u.email,
    contact: u.contact_number,
    role: u.role,
    status: u.status,
    createdAt: u.created_at ? new Date(u.created_at).toISOString().slice(0, 10) : null,
  };
}

function requireSuperAdmin(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "superadmin") {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET" && req.query.directory === "true") {
    if (!getSessionFromRequest(req)) return res.status(401).json({ error: "Unauthorized" });
    const rows = await sql`SELECT id, first_name, middle_name, last_name FROM users WHERE role = 'dentist' AND status = 'active' ORDER BY last_name`;
    return res.status(200).json({ dentists: rows.map((r) => ({ id: r.id, name: joinName(r.first_name, r.middle_name, r.last_name) })) });
  }

  if (!requireSuperAdmin(req, res)) return;

  const id = typeof req.query.id === "string" ? req.query.id : undefined;

  if (req.method === "GET") {
    if (id) {
      const rows = await sql`SELECT * FROM users WHERE id = ${id} AND role IN ('admin', 'dentist')`;
      const staff = rows[0];
      if (!staff) return res.status(404).json({ error: "Staff account not found" });
      return res.status(200).json({ staff: mapStaff(staff) });
    }

    const archived = req.query.archived === "true";
    const rows = archived
      ? await sql`SELECT * FROM users WHERE role IN ('admin', 'dentist') AND status = 'archived' ORDER BY last_name`
      : await sql`SELECT * FROM users WHERE role IN ('admin', 'dentist') AND status != 'archived' ORDER BY role, last_name`;
    return res.status(200).json({ staff: rows.map(mapStaff) });
  }

  if (req.method === "POST") {
    const { employeeId, name, contact, email, role, password } = req.body ?? {};
    if (!name || !email || !role || !password) {
      return res.status(400).json({ error: "Name, email, role, and password are required" });
    }
    if (role !== "admin" && role !== "dentist") {
      return res.status(400).json({ error: "Role must be admin or dentist" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const [existingPatient, existingUser] = await Promise.all([
      sql`SELECT id FROM patients WHERE lower(email) = ${normalizedEmail}`,
      sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`,
    ]);
    if (existingPatient.length > 0 || existingUser.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    if (employeeId) {
      const existingEmpId = await sql`SELECT id FROM users WHERE employee_id = ${employeeId}`;
      if (existingEmpId.length > 0) {
        return res.status(409).json({ error: "An account with this Employee ID already exists" });
      }
    }

    const { firstName, lastName } = splitName(name);
    const passwordHash = await bcrypt.hash(password, 10);
    const inserted = await sql`
      INSERT INTO users (employee_id, email, password_hash, first_name, last_name, contact_number, role, verified, status)
      VALUES (${employeeId ?? null}, ${normalizedEmail}, ${passwordHash}, ${firstName}, ${lastName}, ${contact ?? null}, ${role}, TRUE, 'active')
      RETURNING *
    `;
    return res.status(201).json({ staff: mapStaff(inserted[0]) });
  }

  if (!id) return res.status(400).json({ error: "Missing id" });

  if (req.method === "PATCH") {
    const { action, name, contact, email, password, status } = req.body ?? {};

    if (action === "archive" || action === "restore") {
      await sql`UPDATE users SET status = ${action === "archive" ? "archived" : "active"}, updated_at = now() WHERE id = ${id}`;
    } else {
      const nameParts = name ? splitName(name) : null;
      const passwordHash = password ? await bcrypt.hash(password, 10) : null;
      await sql`
        UPDATE users SET
          first_name = COALESCE(${nameParts?.firstName ?? null}, first_name),
          last_name = COALESCE(${nameParts?.lastName ?? null}, last_name),
          contact_number = COALESCE(${contact ?? null}, contact_number),
          email = COALESCE(${email ? String(email).trim().toLowerCase() : null}, email),
          password_hash = COALESCE(${passwordHash}, password_hash),
          status = COALESCE(${status ?? null}, status),
          updated_at = now()
        WHERE id = ${id}
      `;
    }

    const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
    if (!rows[0]) return res.status(404).json({ error: "Staff account not found" });
    return res.status(200).json({ staff: mapStaff(rows[0]) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
