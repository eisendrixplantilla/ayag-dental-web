import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "../_lib/db";
import { signSession } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

  const normalizedEmail = String(email).trim().toLowerCase();

  const rows = await sql`SELECT * FROM users WHERE lower(email) = ${normalizedEmail}`;
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: "Invalid email or password" });

  if (user.role === "patient") {
    const profile = await sql`SELECT status FROM patient_profiles WHERE user_id = ${user.id}`;
    if (profile[0]?.status === "inactive") {
      return res.status(403).json({ error: "Your account has been deactivated. Please contact the clinic administrator." });
    }
    await sql`UPDATE patient_profiles SET last_login = now() WHERE user_id = ${user.id}`;
  }

  const token = signSession({ sub: user.id, email: user.email, role: user.role });
  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, verified: user.verified },
  });
}
