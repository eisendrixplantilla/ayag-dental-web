import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "../_lib/db.js";
import { isOtpFormatValid } from "../_lib/otp.js";
import { getSessionFromRequest } from "../_lib/auth.js";

async function changePassword(req: VercelRequest, res: VercelResponse) {
  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "Missing required fields" });
  if (String(newPassword).length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const table = session.role === "patient" ? "patients" : "users";
  const rows = await sql.query(`SELECT id, password_hash FROM ${table} WHERE id = $1`, [session.sub]);
  const account = (rows as any[])[0];
  if (!account) return res.status(404).json({ error: "Account not found" });

  const match = await bcrypt.compare(currentPassword, account.password_hash);
  if (!match) return res.status(401).json({ error: "Current password is incorrect" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await sql.query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [passwordHash, session.sub]);

  res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (req.body?.currentPassword !== undefined) return changePassword(req, res);

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
  const updatedPatient = await sql`
    UPDATE patients SET password_hash = ${passwordHash} WHERE lower(email) = ${normalizedEmail}
    RETURNING id
  `;
  const updatedUser = updatedPatient.length === 0
    ? await sql`UPDATE users SET password_hash = ${passwordHash} WHERE lower(email) = ${normalizedEmail} RETURNING id`
    : [];
  if (updatedPatient.length === 0 && updatedUser.length === 0) {
    return res.status(404).json({ error: "No account found for this email" });
  }

  await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND purpose = 'reset'`;

  res.status(200).json({ ok: true });
}
