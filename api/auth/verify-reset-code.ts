import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db.js";
import { isOtpFormatValid } from "../lib/otp.js";

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
    WHERE email = ${normalizedEmail} AND purpose = 'reset'
    ORDER BY created_at DESC LIMIT 1
  `;
  const ticket = rows[0];

  if (!ticket || new Date(ticket.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: "This code has expired. Please request a new one." });
  }
  if (ticket.code !== code) {
    return res.status(400).json({ error: "Invalid reset code" });
  }

  res.status(200).json({ ok: true });
}
