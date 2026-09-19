import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const email = String(req.query.email ?? "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Missing email" });

  const [patientRows, userRows] = await Promise.all([
    sql`SELECT id FROM patients WHERE lower(email) = ${email}`,
    sql`SELECT id FROM users WHERE lower(email) = ${email}`,
  ]);
  res.status(200).json({ exists: patientRows.length > 0 || userRows.length > 0 });
}
