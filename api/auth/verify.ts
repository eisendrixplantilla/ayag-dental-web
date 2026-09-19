import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db.js";
import { isOtpFormatValid } from "../_lib/otp.js";
import { signSession } from "../_lib/auth.js";
import { splitName, joinName } from "../_lib/name.js";

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
