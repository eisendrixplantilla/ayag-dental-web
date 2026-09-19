import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db.js";
import { sendOtpEmail } from "../lib/email.js";
import { generateOtpCode, OTP_TTL_MS } from "../lib/otp.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "Missing email" });

  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`;
  if (existing.length === 0) {
    return res.status(404).json({ error: "No account found with this email address" });
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  try {
    await sendOtpEmail(normalizedEmail, code, OTP_TTL_MS / 60_000);
  } catch {
    return res.status(502).json({ error: "Failed to send reset code. Please try again." });
  }

  await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND purpose = 'reset'`;
  await sql`
    INSERT INTO otp_codes (email, purpose, code, expires_at)
    VALUES (${normalizedEmail}, 'reset', ${code}, ${expiresAt.toISOString()})
  `;

  res.status(200).json({ ok: true });
}
