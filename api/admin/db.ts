import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Pool } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { sql } from "../_lib/db.js";
import { SCHEMA_SQL } from "../_db/schema.js";

const DEFAULT_USERS = [
  { email: "admin@admin.com", name: "Dr. Sarah Chen", role: "admin", password: "admin123" },
  { email: "user@user.com", name: "John Smith", role: "patient", password: "user123" },
  { email: "super@admin.com", name: "Super Administrator", role: "superadmin", password: "super123" },
  { email: "dentist@ayagdental.com", name: "Dr. Mike Johnson", role: "dentist", password: "dentist123" },
];

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(SCHEMA_SQL);
  } finally {
    await pool.end();
  }
}

async function seed() {
  const created: string[] = [];
  for (const u of DEFAULT_USERS) {
    const existing = await sql`SELECT id FROM users WHERE lower(email) = ${u.email}`;
    if (existing.length > 0) continue;

    const passwordHash = await bcrypt.hash(u.password, 10);
    const inserted = await sql`
      INSERT INTO users (email, password_hash, name, role, verified)
      VALUES (${u.email}, ${passwordHash}, ${u.name}, ${u.role}, TRUE)
      RETURNING id, role
    `;
    const user = inserted[0];
    if (user.role === "patient") {
      await sql`INSERT INTO patient_profiles (user_id) VALUES (${user.id})`;
    } else if (user.role === "admin" || user.role === "dentist") {
      await sql`INSERT INTO staff_profiles (user_id) VALUES (${user.id})`;
    }
    created.push(u.email);
  }
  return created;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${process.env.MIGRATE_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const action = req.body?.action ?? req.query.action;
  try {
    if (action === "seed") {
      const created = await seed();
      return res.status(200).json({ ok: true, created });
    }
    if (action === "migrate") {
      await migrate();
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Missing or invalid action (expected 'migrate' or 'seed')" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
