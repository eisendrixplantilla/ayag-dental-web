import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "../lib/db.js";
import { sendOtpEmail } from "../lib/email.js";
import { generateOtpCode, OTP_TTL_MS } from "../lib/otp.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email, password, role } = req.body ?? {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const existing = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`;
  if (existing.length > 0) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  try {
    await sendOtpEmail(normalizedEmail, code, OTP_TTL_MS / 60_000);
  } catch {
    return res.status(502).json({ error: "Failed to send verification email. Please try again." });
  }

  await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND purpose = 'register'`;
  await sql`
    INSERT INTO otp_codes (email, purpose, code, expires_at, pending_name, pending_password_hash, pending_role)
    VALUES (${normalizedEmail}, 'register', ${code}, ${expiresAt.toISOString()}, ${name}, ${passwordHash}, ${role})
  `;

  res.status(200).json({ ok: true });
}
