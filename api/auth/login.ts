import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "../_lib/db.js";
import { signSession } from "../_lib/auth.js";
import { joinName } from "../_lib/name.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

  const normalizedEmail = String(email).trim().toLowerCase();

  const patientRows = await sql`SELECT * FROM patients WHERE lower(email) = ${normalizedEmail}`;
  const patient = patientRows[0];
  if (patient) {
    const match = await bcrypt.compare(password, patient.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });
    if (patient.status === "inactive") {
      return res.status(403).json({ error: "Your account has been deactivated. Please contact the clinic administrator." });
    }
    await sql`UPDATE patients SET last_login = now() WHERE id = ${patient.id}`;

    const token = signSession({ sub: patient.id, email: patient.email, role: "patient" });
    return res.status(200).json({
      token,
      user: { id: patient.id, email: patient.email, name: joinName(patient.first_name, patient.middle_name, patient.last_name), role: "patient", verified: patient.verified },
    });
  }

  const userRows = await sql`SELECT * FROM users WHERE lower(email) = ${normalizedEmail}`;
  const user = userRows[0];
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: "Invalid email or password" });

  const token = signSession({ sub: user.id, email: user.email, role: user.role });
  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, name: joinName(user.first_name, user.middle_name, user.last_name), role: user.role, verified: user.verified },
  });
}
