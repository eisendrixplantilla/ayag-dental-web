import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db";
import { isOtpFormatValid } from "../lib/otp";
import { signSession } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, code } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "Missing email" });
  if (!isOtpFormatValid(code)) {
    return res.status(400).json({ error: "Enter the 6-digit code sent to your email" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const rows = await sql`
    SELECT * FROM otp_codes
    WHERE email = ${normalizedEmail} AND purpose = 'register'
    ORDER BY created_at DESC LIMIT 1
  `;
  const ticket = rows[0];

  if (!ticket || new Date(ticket.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "This code has expired. Please register again to get a new one." });
  }
  if (ticket.code !== code) {
    return res.status(400).json({ error: "Invalid verification code" });
  }

  const inserted = await sql`
    INSERT INTO users (email, password_hash, name, role, verified)
    VALUES (${normalizedEmail}, ${ticket.pending_password_hash}, ${ticket.pending_name}, ${ticket.pending_role}, TRUE)
    RETURNING id, email, name, role, verified
  `;
  const user = inserted[0];

  if (user.role === "patient") {
    await sql`INSERT INTO patient_profiles (user_id) VALUES (${user.id})`;
  } else if (user.role === "admin" || user.role === "dentist") {
    await sql`INSERT INTO staff_profiles (user_id) VALUES (${user.id})`;
  }

  await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND purpose = 'register'`;

  const token = signSession({ sub: user.id, email: user.email, role: user.role });
  res.status(200).json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, verified: user.verified },
  });
}
