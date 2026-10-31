import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./db.js";
import type { SessionPayload } from "./auth.js";

/*
 * Clinical photos on a dental record: what the teeth looked like before the procedure and
 * after it. Taken by the dentist at the consultation, shrunk in the browser to a JPEG, and
 * seen by dentists only: they're medical records, kept from the front desk and the patient.
 */

export const PHOTO_KINDS = ["before", "after"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];
/** What a photo may be labelled with, to tell the views apart. */
export const PHOTO_LABELS = ["Front", "Upper", "Lower", "Left", "Right"] as const;
/** Per record, before and after each: enough for every view, and a response that stays small. */
export const MAX_PHOTOS_PER_KIND = 6;
/** A shrunk photo is ~150 KB; this leaves room for a detailed one and refuses a raw upload. */
const MAX_IMAGE = 700_000;
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

/** The table, made on first use (once per instance): the live database isn't migrated on
 * deploy. It's in schema.ts too. */
let ready: Promise<void> | null = null;
export function ensurePhotoTable(): Promise<void> {
  ready ??= (async () => {
    await sql`/* record-photos-table */ CREATE TABLE IF NOT EXISTS record_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      record_id UUID NOT NULL REFERENCES dental_records(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('before', 'after')),
      label TEXT,
      image TEXT NOT NULL,
      taken_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`/* record-photos-index */ CREATE INDEX IF NOT EXISTS idx_record_photos_record ON record_photos(record_id)`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

interface PhotoRow {
  id: string; record_id: string; kind: PhotoKind; label: string | null; image: string;
  taken_by: string | null; created_at: string;
}

function mapPhoto(r: PhotoRow) {
  return { id: r.id, recordId: r.record_id, kind: r.kind, label: r.label, image: r.image, takenBy: r.taken_by, takenAt: r.created_at };
}

/**
 * `/api/dental-records?photos=<record id>` (GET): the record's photos, oldest first.
 * `/api/dental-records?photos=true` (POST): adds one { recordId, kind, label, image }.
 * `/api/dental-records?photo=<id>` (PATCH { label }): relabels one; (DELETE): takes one off.
 */
export async function photosHandler(req: VercelRequest, res: VercelResponse, session: SessionPayload) {
  if (session.role !== "dentist") return res.status(403).json({ error: "Forbidden" });
  await ensurePhotoTable();

  if (req.method === "GET" && typeof req.query.photos === "string") {
    const rows = await sql`/* record-photos-list */ SELECT * FROM record_photos
      WHERE record_id = ${req.query.photos} ORDER BY created_at, id`;
    return res.status(200).json({ photos: (rows as PhotoRow[]).map(mapPhoto) });
  }

  if (req.method === "POST") {
    const { recordId, kind, label, image } = req.body ?? {};
    if (typeof recordId !== "string" || !PHOTO_KINDS.includes(kind)) {
      return res.status(400).json({ error: "recordId and a kind (before or after) are required" });
    }
    if (typeof image !== "string" || !JPEG.test(image) || image.length > MAX_IMAGE) {
      return res.status(400).json({ error: "The photo has to be a JPEG under 500 KB." });
    }
    const [record] = await sql`/* record-photos-record */ SELECT id FROM dental_records WHERE id = ${recordId}`;
    if (!record) return res.status(404).json({ error: "Dental record not found" });
    const [{ n }] = await sql`/* record-photos-count */ SELECT count(*)::int AS n FROM record_photos
      WHERE record_id = ${recordId} AND kind = ${kind}`;
    if (n >= MAX_PHOTOS_PER_KIND) {
      return res.status(409).json({ error: `A record holds up to ${MAX_PHOTOS_PER_KIND} ${kind} photos.` });
    }
    const name = typeof label === "string" && (PHOTO_LABELS as readonly string[]).includes(label) ? label : null;
    const [who] = await sql`/* record-photos-taker */ SELECT first_name, last_name, email FROM users WHERE id = ${session.sub}`;
    const takenBy = [who?.first_name, who?.last_name].filter(Boolean).join(" ") || who?.email || null;
    const [row] = await sql`/* record-photos-save */ INSERT INTO record_photos (record_id, kind, label, image, taken_by)
      VALUES (${recordId}, ${kind}, ${name}, ${image}, ${takenBy}) RETURNING *`;
    return res.status(201).json({ photo: mapPhoto(row as PhotoRow) });
  }

  if (req.method === "PATCH" && typeof req.query.photo === "string") {
    const { label } = req.body ?? {};
    const name = typeof label === "string" && (PHOTO_LABELS as readonly string[]).includes(label) ? label : null;
    const rows = await sql`/* record-photos-label */ UPDATE record_photos SET label = ${name} WHERE id = ${req.query.photo} RETURNING *`;
    if (!rows[0]) return res.status(404).json({ error: "Photo not found" });
    return res.status(200).json({ photo: mapPhoto(rows[0] as PhotoRow) });
  }

  if (req.method === "DELETE" && typeof req.query.photo === "string") {
    const rows = await sql`/* record-photos-delete */ DELETE FROM record_photos WHERE id = ${req.query.photo} RETURNING id`;
    if (!rows[0]) return res.status(404).json({ error: "Photo not found" });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
