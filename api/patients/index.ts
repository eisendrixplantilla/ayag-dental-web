import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const rows = await sql`
    SELECT u.id, u.email, u.name, u.role, u.verified
    FROM users u
    JOIN patient_profiles p ON p.user_id = u.id
    WHERE p.archived_at IS NULL
    ORDER BY u.name
  `;
  res.status(200).json({ patients: rows });
}
