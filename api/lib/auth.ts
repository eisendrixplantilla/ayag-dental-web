import jwt from "jsonwebtoken";
import type { VercelRequest } from "@vercel/node";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface SessionPayload {
  sub: string;
  email: string;
  role: "admin" | "patient" | "superadmin" | "dentist";
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(req: VercelRequest): SessionPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifySession(header.slice("Bearer ".length));
}
