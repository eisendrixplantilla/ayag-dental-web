import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const email = String(req.query.email ?? "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Missing email" });

  const rows = await sql`SELECT id FROM users WHERE lower(email) = ${email}`;
  res.status(200).json({ exists: rows.length > 0 });
}
