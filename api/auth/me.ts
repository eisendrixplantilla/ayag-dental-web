import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "../_lib/db";
import { getSessionFromRequest } from "../_lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = getSessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  const rows = await sql`SELECT id, email, name, role, verified FROM users WHERE id = ${session.sub}`;
  const user = rows[0];
  if (!user) return res.status(404).json({ error: "User not found" });

  res.status(200).json({ user });
}
