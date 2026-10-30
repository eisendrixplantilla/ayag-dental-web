import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Appointment } from "@/lib/api/appointments";
import type { DentalRecord } from "@/lib/api/dentalRecords";

/* A dentist's to-dos: consultations still waiting for their dental record, and patients
 * whose recommended next visit is close or past and not booked. */

/** How far ahead a recommended next visit shows as due. */
export const FOLLOW_UP_DAYS = 14;

/** Same patient: by account, or by name for a guest. */
const samePatient = (a: { patientId: string | null; patientName: string | null }, b: { patientId: string | null; patientName: string | null }) =>
  a.patientId ? a.patientId === b.patientId : !b.patientId && a.patientName === b.patientName;

/** Finished consultations (the dentist's own) with no dental record yet, the latest
 * finished first (completing one updates it). */
export function recordsToWrite(appointments: Appointment[], records: DentalRecord[]): Appointment[] {
  const written = new Set(records.map((r) => r.appointmentId));
  return appointments.filter((a) => a.status === "completed" && !written.has(a.id))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (b.date + b.time).localeCompare(a.date + a.time));
}

/**
 * Each patient's latest record whose next visit is within `FOLLOW_UP_DAYS` or already past,
 * when nothing has been booked (or held) for that patient since the record. Newest record first.
 */
export function followUpsDue(records: DentalRecord[], appointments: Appointment[], today: string): DentalRecord[] {
  const latest = new Map<string, DentalRecord>();
  for (const r of records) {
    const key = r.patientId ?? `name:${r.patientName ?? ""}`;
    const seen = latest.get(key);
    if (!seen || r.date > seen.date || (r.date === seen.date && r.createdAt > seen.createdAt)) latest.set(key, r);
  }
  return [...latest.values()]
    .filter((r) => r.nextVisit && differenceInCalendarDays(parseISO(r.nextVisit), parseISO(today)) <= FOLLOW_UP_DAYS)
    .filter((r) => !appointments.some((a) => a.date > r.date && a.status !== "cancelled" && a.status !== "rejected"
      && samePatient({ patientId: r.patientId, patientName: r.patientName }, a)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

