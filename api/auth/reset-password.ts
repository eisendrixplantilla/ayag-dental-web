import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "../lib/db";
import { isOtpFormatValid } from "../lib/otp";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, code, newPassword } = req.body ?? {};
  if (!email || !newPassword) return res.status(400).json({ error: "Missing required fields" });
  if (!isOtpFormatValid(code)) {
    return res.status(400).json({ error: "Invalid or expired reset code" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const rows = await sql`
    SELECT * FROM otp_codes
    WHERE email = ${normalizedEmail} AND purpose = 'reset'
    ORDER BY created_at DESC LIMIT 1
  `;
  const ticket = rows[0];

  if (!ticket || new Date(ticket.expires_at).getTime() < Date.now() || ticket.code !== code) {
    return res.status(400).json({ error: "Invalid or expired reset code" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await sql`
    UPDATE users SET password_hash = ${passwordHash} WHERE lower(email) = ${normalizedEmail}
    RETURNING id
  `;
  if (updated.length === 0) {
    return res.status(404).json({ error: "No account found for this email" });
  }

  await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND purpose = 'reset'`;

  res.status(200).json({ ok: true });
}
