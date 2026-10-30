import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sql } from "./db.js";
import type { SessionPayload } from "./auth.js";
import { displayService } from "./services.js";

/*
 * The patient's consent to a procedure, signed on screen before the dentist starts the
 * consultation. One per appointment; once signed it can't be changed, like a paper form.
 * A patient who refuses is recorded as declined, and can still sign later.
 */

/** The standard wording, until the superadmin writes the clinic's own in Settings. */
export const DEFAULT_CONSENT = `I, {patient}, give my consent to {dentist} of {clinic} to perform the following procedure on {date}: {procedure}.

The dentist has explained to me the nature and purpose of the procedure, its expected benefits, its possible risks and complications (such as pain, swelling, bleeding, infection, sensitivity, numbness, or the need for further treatment), and the other options available to me, including having no treatment.

I was given the chance to ask questions, and they were answered to my satisfaction. I understand that dentistry is not an exact science and that no guarantee has been made to me about the result.

I agree to the use of local anesthesia and of any X-rays the procedure needs. I have told the dentist truthfully about my medical history, my medicines and my allergies.

I understand that I may refuse or stop the treatment at any time.

I sign this consent freely, having read and understood it.`;

/** What the wording may name, filled in for each appointment. */
export const CONSENT_FIELDS = ["{patient}", "{procedure}", "{dentist}", "{date}", "{clinic}"] as const;

export function fillConsent(
  template: string,
  v: { patient: string; procedure: string; dentist: string; date: string; clinic: string },
): string {
  return template
    .replace(/\{patient\}/g, v.patient)
    .replace(/\{procedure\}/g, v.procedure)
    .replace(/\{dentist\}/g, v.dentist)
    .replace(/\{date\}/g, v.date)
    .replace(/\{clinic\}/g, v.clinic);
}

/** The longest wording the superadmin may save. */
export const MAX_CONSENT_TEXT = 8000;

/**
 * The consents table and the clinic's own wording, made on first use (once per instance):
 * the live database isn't migrated on deploy. Both are in schema.ts too.
 */
let ready: Promise<void> | null = null;
export function ensureConsentTables(): Promise<void> {
  ready ??= (async () => {
    await sql`/* consent-text-column */ ALTER TABLE clinic_info ADD COLUMN IF NOT EXISTS consent_text TEXT`;
    await sql`/* consents-table */ CREATE TABLE IF NOT EXISTS consents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('signed', 'declined')),
      patient_name TEXT NOT NULL,
      procedure TEXT,
      dentist_name TEXT,
      consent_text TEXT NOT NULL,
      signature TEXT,
      decline_reason TEXT,
      recorded_by TEXT,
      signed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** The clinic's wording (or the standard one) and its name. */
export async function consentTemplate(): Promise<{ text: string; custom: boolean; clinic: string }> {
  const [row] = await sql`/* consent-template */ SELECT name, consent_text FROM clinic_info WHERE id = 1`;
  const own = typeof row?.consent_text === "string" ? row.consent_text.trim() : "";
  return { text: own || DEFAULT_CONSENT, custom: !!own, clinic: row?.name?.trim() || "Ayag Dental Clinic" };
}

/** "2026-10-30" → "October 30, 2026". */
const longDate = (d: unknown) =>
  new Date(d as string).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });

const STAFF = new Set(["dentist", "admin", "superadmin"]);
/** Only an approved visit is treated, so only one has a consent taken. */
const APPROVED = ["confirmed", "rescheduled"];
/** A drawn signature as a PNG; a few tens of KB in practice. */
const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE = 500_000;

interface ConsentRow {
  appointment_id: string; status: "signed" | "declined"; patient_name: string; procedure: string | null;
  dentist_name: string | null; consent_text: string; signature: string | null; decline_reason: string | null;
  recorded_by: string | null; signed_at: string;
}
interface AppointmentRow {
  id: string; patient_id: string | null; patient_name: string; service: string; date: string;
  dentist_name: string | null; status: string;
}

function mapConsent(r: ConsentRow) {
  return {
    appointmentId: r.appointment_id,
    status: r.status,
    patientName: r.patient_name,
    procedure: r.procedure,
    dentistName: r.dentist_name,
    text: r.consent_text,
    signature: r.signature,
    declineReason: r.decline_reason,
    recordedBy: r.recorded_by,
    signedAt: r.signed_at,
  };
}

/** The appointment's consent form, filled in for it. */
async function formFor(appt: AppointmentRow) {
  const t = await consentTemplate();
  return {
    patientName: appt.patient_name,
    procedure: displayService(appt.service),
    dentistName: appt.dentist_name ?? null,
    date: longDate(appt.date),
    text: fillConsent(t.text, {
      patient: appt.patient_name,
      procedure: displayService(appt.service),
      dentist: appt.dentist_name || "the attending dentist",
      date: longDate(appt.date),
      clinic: t.clinic,
    }),
  };
}

/**
 * `/api/appointments?consents=true` (GET): which visits have a consent, and how it went.
 * `/api/appointments?consent=<appointment id>` (GET): that visit's consent, and for staff
 * the form to sign while there's none.
 * `/api/appointments?consent=true` (POST): the patient signs or declines.
 */
export async function consentHandler(req: VercelRequest, res: VercelResponse, session: SessionPayload) {
  await ensureConsentTables();

  if (req.method === "GET" && req.query.consents) {
    const rows = session.role === "patient"
      ? await sql`/* consent-list */ SELECT c.appointment_id, c.status, c.signed_at FROM consents c
          JOIN appointments a ON a.id = c.appointment_id WHERE a.patient_id = ${session.sub}`
      : await sql`/* consent-list */ SELECT c.appointment_id, c.status, c.signed_at FROM consents c`;
    return res.status(200).json({
      consents: (rows as ConsentRow[]).map((r) => ({ appointmentId: r.appointment_id, status: r.status, signedAt: r.signed_at })),
    });
  }

  if (req.method === "GET") {
    const id = String(req.query.consent);
    const [appt] = (await sql`/* consent-appointment */ SELECT id, patient_id, patient_name, service, date, dentist_name, status
      FROM appointments WHERE id = ${id}`) as AppointmentRow[];
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    if (session.role === "patient" && appt.patient_id !== session.sub) return res.status(403).json({ error: "Forbidden" });
    const [row] = await sql`/* consent-one */ SELECT * FROM consents WHERE appointment_id = ${id}`;
    const consent = row ? mapConsent(row as ConsentRow) : null;
    const form = STAFF.has(session.role) && consent?.status !== "signed" ? await formFor(appt) : null;
    return res.status(200).json({ consent, form });
  }

  if (req.method === "POST") {
    if (!STAFF.has(session.role)) return res.status(403).json({ error: "Forbidden" });
    const { appointmentId, decision, printedName, signature, reason } = req.body ?? {};
    if (!appointmentId || (decision !== "signed" && decision !== "declined")) {
      return res.status(400).json({ error: "appointmentId and a decision (signed or declined) are required" });
    }
    const name = typeof printedName === "string" ? printedName.trim().slice(0, 120) : "";
    if (decision === "signed") {
      if (!name) return res.status(400).json({ error: "The patient's printed name is required." });
      if (typeof signature !== "string" || !SIGNATURE.test(signature) || signature.length > MAX_SIGNATURE) {
        return res.status(400).json({ error: "The patient's signature is required." });
      }
    }
    const [appt] = (await sql`/* consent-appointment */ SELECT id, patient_id, patient_name, service, date, dentist_name, status
      FROM appointments WHERE id = ${appointmentId}`) as AppointmentRow[];
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    if (!APPROVED.includes(appt.status)) {
      return res.status(409).json({ error: "A consent is taken for an approved appointment, before its consultation." });
    }
    const form = await formFor(appt);
    const [who] = await sql`/* consent-recorder */ SELECT first_name, last_name, name, email FROM users WHERE id = ${session.sub}`;
    const recordedBy = [who?.first_name, who?.last_name].filter(Boolean).join(" ") || who?.name || who?.email || null;
    const declineReason = decision === "declined" && typeof reason === "string" ? reason.trim().slice(0, 500) || null : null;

    // A declined consent can still be signed later; a signed one is never changed.
    const rows = await sql`/* consent-save */
      INSERT INTO consents (appointment_id, status, patient_name, procedure, dentist_name, consent_text, signature, decline_reason, recorded_by)
      VALUES (${appointmentId}, ${decision}, ${name || appt.patient_name}, ${form.procedure}, ${form.dentistName}, ${form.text},
        ${decision === "signed" ? signature : null}, ${declineReason}, ${recordedBy})
      ON CONFLICT (appointment_id) DO UPDATE SET
        status = EXCLUDED.status, patient_name = EXCLUDED.patient_name, procedure = EXCLUDED.procedure,
        dentist_name = EXCLUDED.dentist_name, consent_text = EXCLUDED.consent_text, signature = EXCLUDED.signature,
        decline_reason = EXCLUDED.decline_reason, recorded_by = EXCLUDED.recorded_by, signed_at = now()
      WHERE consents.status = 'declined'
      RETURNING *`;
    if (!rows[0]) return res.status(409).json({ error: "This consent is already signed and can't be changed." });
    return res.status(201).json({ consent: mapConsent(rows[0] as ConsentRow) });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
