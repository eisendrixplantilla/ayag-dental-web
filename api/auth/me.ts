import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { getSessionFromRequest } from "../_lib/auth.js";
import { joinName } from "../_lib/name.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  if (session.role === "patient") {
    const rows = await sql`SELECT id, email, first_name, middle_name, last_name, verified FROM patients WHERE id = ${session.sub}`;
    const patient = rows[0];
    if (!patient) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({
      user: { id: patient.id, email: patient.email, name: joinName(patient.first_name, patient.middle_name, patient.last_name), role: "patient", verified: patient.verified },
    });
  }

  const rows = await sql`SELECT id, email, first_name, middle_name, last_name, role, verified, employee_id FROM users WHERE id = ${session.sub}`;
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      name: joinName(user.first_name, user.middle_name, user.last_name),
      role: user.role,
      verified: user.verified,
      employeeId: user.employee_id,
    },
  });
}
