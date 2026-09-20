import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { sql } from "../_lib/db.js";
import { sendOtpEmail } from "../_lib/email.js";
import { generateOtpCode, OTP_TTL_MS } from "../_lib/otp.js";
import { isOtpFormatValid } from "../_lib/otp.js";
import { signSession } from "../_lib/auth.js";
import { splitName, joinName } from "../_lib/name.js";

async function verify(req: VercelRequest, res: VercelResponse) {
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

  const { firstName, lastName } = splitName(ticket.pending_name);
  const role = ticket.pending_role as string;

  let userId: string;
  if (role === "patient") {
    const inserted = await sql`
      INSERT INTO patients (email, password_hash, first_name, last_name, verified)
      VALUES (${normalizedEmail}, ${ticket.pending_password_hash}, ${firstName}, ${lastName}, TRUE)
      RETURNING id
    `;
    userId = inserted[0].id;
  } else {
    const inserted = await sql`
      INSERT INTO users (email, password_hash, first_name, last_name, role, verified)
      VALUES (${normalizedEmail}, ${ticket.pending_password_hash}, ${firstName}, ${lastName}, ${role}, TRUE)
      RETURNING id
    `;
    userId = inserted[0].id;
  }

  await sql`DELETE FROM otp_codes WHERE email = ${normalizedEmail} AND purpose = 'register'`;

  const token = signSession({ sub: userId, email: normalizedEmail, role: role as any });
  res.status(200).json({
    token,
    user: { id: userId, email: normalizedEmail, name: joinName(firstName, null, lastName), role, verified: true },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (req.body?.code !== undefined) return verify(req, res);

  const { name, email, password, role } = req.body ?? {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  const [existingPatient, existingUser] = await Promise.all([
    sql`SELECT id FROM patients WHERE lower(email) = ${normalizedEmail}`,
    sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail}`,
  ]);
  if (existingPatient.length > 0 || existingUser.length > 0) {
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
