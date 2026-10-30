import { api } from "@/contexts/AuthContext";

/*
 * The patient's consent to a procedure: signed on screen before the consultation (one per
 * appointment), or recorded as declined. Signed, it can't be changed.
 */

export type ConsentStatus = "signed" | "declined";

export interface Consent {
  appointmentId: string;
  status: ConsentStatus;
  /** The name the patient printed (for a declined one, the patient's name). */
  patientName: string;
  procedure: string | null;
  dentistName: string | null;
  /** The wording as it was signed. */
  text: string;
  /** The drawn signature, a PNG data URL. */
  signature: string | null;
  declineReason: string | null;
  /** The staff member who took it. */
  recordedBy: string | null;
  signedAt: string;
}

/** The form to sign, filled in for the appointment. */
export interface ConsentForm {
  patientName: string;
  procedure: string;
  dentistName: string | null;
  date: string;
  text: string;
}

export interface ConsentSummary {
  appointmentId: string;
  status: ConsentStatus;
  signedAt: string;
}

/** Which appointments have a consent, and how it went: a patient's own, or every one for staff. */
export async function getConsents(): Promise<Map<string, ConsentSummary>> {
  const data = await api<{ consents: ConsentSummary[] }>("/appointments?consents=true");
  return new Map((data.consents ?? []).map((c) => [c.appointmentId, c]));
}

/** An appointment's consent, and (for staff, until it's signed) the form to sign. */
export async function getConsent(appointmentId: string): Promise<{ consent: Consent | null; form: ConsentForm | null }> {
  return api(`/appointments?consent=${encodeURIComponent(appointmentId)}`);
}

export async function signConsent(appointmentId: string, printedName: string, signature: string): Promise<Consent> {
  const data = await api<{ consent: Consent }>("/appointments?consent=true", {
    method: "POST",
    body: JSON.stringify({ appointmentId, decision: "signed", printedName, signature }),
  });
  return data.consent;
}

export async function declineConsent(appointmentId: string, reason: string): Promise<Consent> {
  const data = await api<{ consent: Consent }>("/appointments?consent=true", {
    method: "POST",
    body: JSON.stringify({ appointmentId, decision: "declined", reason }),
  });
  return data.consent;
}

/** The consent form's wording, for the superadmin's Settings. */
export interface ConsentWording {
  text: string;
  /** Whether it's the clinic's own, not the standard one. */
  custom: boolean;
  standard: string;
  fields: string[];
}

export async function getConsentWording(): Promise<ConsentWording> {
  return api<ConsentWording>("/staff?consentText=true");
}

/** Empty goes back to the standard wording. */
export async function saveConsentWording(text: string): Promise<ConsentWording> {
  return api<ConsentWording>("/staff?consentText=true", { method: "PUT", body: JSON.stringify({ text }) });
}
