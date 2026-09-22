import { api } from "@/contexts/AuthContext";

/** Fired after any appointment write, so live views (bell, sidebar counts) can update at once. */
export const APPOINTMENTS_CHANGED = "appointments:changed";
const announceChange = () => window.dispatchEvent(new Event(APPOINTMENTS_CHANGED));

export type AptStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected" | "rescheduled";

export interface Appointment {
  id: string;
  patientId: string | null;
  patientName: string;
  contact: string | null;
  email: string | null;
  dentistId: string | null;
  dentistName: string | null;
  service: string;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm
  endTime: string | null;
  type: "online" | "walk-in";
  status: AptStatus;
  reason: string | null;
  remarks: string | null;
  rescheduleCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppointmentInput {
  patientId?: string;
  patientName: string;
  contact?: string;
  email?: string;
  dentistId?: string;
  dentistName?: string;
  service: string;
  date: string;
  time: string;
  type: "online" | "walk-in";
  reason?: string;
}

export interface AppointmentFilters {
  patientId?: string;
  dentistId?: string;
  date?: string;
  status?: AptStatus;
  type?: "online" | "walk-in";
}

export async function getAppointments(filters: AppointmentFilters = {}): Promise<Appointment[]> {
  const params = new URLSearchParams(filters as Record<string, string>);
  const query = params.toString();
  const data = await api<{ appointments: Appointment[] }>(`/appointments${query ? `?${query}` : ""}`);
  return data.appointments;
}

export async function getAppointment(id: string): Promise<Appointment> {
  const data = await api<{ appointment: Appointment }>(`/appointments?id=${encodeURIComponent(id)}`);
  return data.appointment;
}

export async function createAppointment(input: AppointmentInput): Promise<Appointment> {
  const data = await api<{ appointment: Appointment }>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  announceChange();
  return data.appointment;
}

export interface AppointmentUpdate {
  status?: AptStatus;
  date?: string;
  time?: string;
  reason?: string;
  remarks?: string;
  dentistId?: string;
  dentistName?: string;
}

/**
 * `emailSent`: null when no email was due (no address on file, or the status didn't
 * change); otherwise whether the patient's status email actually went out.
 */
export type UpdatedAppointment = Appointment & { emailSent: boolean | null };

export async function updateAppointment(id: string, patch: AppointmentUpdate): Promise<UpdatedAppointment> {
  const data = await api<{ appointment: Appointment; emailSent?: boolean | null }>(`/appointments?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  announceChange();
  return { ...data.appointment, emailSent: data.emailSent ?? null };
}

/** Toast wording for the email outcome of a status change. */
export function describeEmailOutcome(result: UpdatedAppointment, what: string): { ok: boolean; text: string } {
  if (result.emailSent === true) return { ok: true, text: `${what} email sent to ${result.email}.` };
  if (result.emailSent === false) return { ok: false, text: `Saved, but the ${what.toLowerCase()} email to ${result.email} couldn't be sent. Please let the patient know directly.` };
  return { ok: true, text: "No email on file for this patient, so no email was sent." };
}

export async function deleteAppointment(id: string): Promise<void> {
  await api(`/appointments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  announceChange();
}

export const confirmAppointment = (id: string) => updateAppointment(id, { status: "confirmed" });
export const rejectAppointment = (id: string, reason: string) => updateAppointment(id, { status: "rejected", reason });
export const cancelAppointment = (id: string, reason: string, remarks?: string) => updateAppointment(id, { status: "cancelled", reason, remarks });
export const rescheduleAppointment = (id: string, data: { date: string; time: string; reason: string; remarks?: string }) =>
  updateAppointment(id, { status: "rescheduled", ...data });
export const completeAppointment = (id: string) => updateAppointment(id, { status: "completed" });
