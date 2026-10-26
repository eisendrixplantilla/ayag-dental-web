import { api } from "@/contexts/AuthContext";
import type { BookedSlot } from "@/lib/api/appointments";
import type { ServiceHours } from "@/lib/api/staff";

/** How many of one procedure a dentist takes in a day. */
export interface ServiceLimit {
  service: string;
  dailyLimit: number;
}

export async function getServiceLimits(dentistId: string | null, dentistName?: string | null): Promise<ServiceLimit[]> {
  const params = new URLSearchParams({ serviceLimits: "true" });
  if (dentistId) params.set("dentistId", dentistId);
  if (dentistName) params.set("dentistName", dentistName);
  const data = await api<{ limits: ServiceLimit[] }>(`/staff?${params}`);
  return data.limits;
}

/** Replaces a dentist's limits with these. A service left out has no limit. */
export async function saveServiceLimits(dentistId: string, limits: ServiceLimit[]): Promise<ServiceLimit[]> {
  const data = await api<{ limits: ServiceLimit[] }>("/staff?serviceLimits=true", {
    method: "PUT",
    body: JSON.stringify({ dentistId, limits }),
  });
  return data.limits;
}

/** One day of a dentist's month: the spans already taken, and how many of each service. */
export interface DayBookings {
  slots: BookedSlot[];
  services: Record<string, number>;
}

/** A dentist's bookings for every day from `from` to `to` ("YYYY-MM-DD"), keyed by date.
 * Days with nothing booked are left out. `excludeId` leaves out a booking being moved. */
export async function getMonthAvailability(q: {
  dentistId: string | null; dentistName?: string | null; from: string; to: string; excludeId?: string;
}): Promise<Record<string, DayBookings>> {
  const params = new URLSearchParams({ availability: "1", from: q.from, to: q.to });
  if (q.dentistId) params.set("dentistId", q.dentistId);
  if (q.dentistName) params.set("dentistName", q.dentistName);
  if (q.excludeId) params.set("excludeId", q.excludeId);
  const data = await api<{ days: Record<string, DayBookings> }>(`/appointments?${params}`);
  return data.days;
}

/** A dentist as patients choose between them. */
export interface DentistProfile {
  id: string;
  name: string;
  photoUrl: string | null;
  /** The services they offer; null when they offer every service. */
  services: string[] | null;
  days: { dayOfWeek: number; start: string; end: string }[];
  limits: ServiceLimit[];
  /** Days and hours kept for particular services. */
  hours: ServiceHours[];
  /** The coming dates they're away ("YYYY-MM-DD"), and why; with hours when only part of the day. */
  unavailable?: { date: string; reason: string | null; startTime?: string | null; endTime?: string | null }[];
}

/** Every active dentist, with what they offer and when they work. Needs no sign-in. */
export async function getDentistProfiles(): Promise<DentistProfile[]> {
  const data = await api<{ dentists: DentistProfile[] }>("/staff?dentistProfiles=true");
  return data.dentists;
}

/** Sets which services a dentist offers; an empty list means every service. */
export async function saveDentistServices(dentistId: string, services: string[]): Promise<string[]> {
  const data = await api<{ services: string[] }>("/staff?dentistServices=true", {
    method: "PUT",
    body: JSON.stringify({ dentistId, services }),
  });
  return data.services;
}

/** Replaces the days and hours a dentist keeps for particular services. A service left out
 * can be booked whenever the dentist works. */
export async function saveServiceHours(dentistId: string, hours: ServiceHours[]): Promise<ServiceHours[]> {
  const data = await api<{ hours: ServiceHours[] }>("/staff?serviceHours=true", {
    method: "PUT",
    body: JSON.stringify({ dentistId, hours }),
  });
  return data.hours;
}

/** Whether a dentist offers every one of these services. */
export const offersAll = (d: Pick<DentistProfile, "services">, services: string[]) =>
  !d.services || services.every((s) => d.services!.includes(s));
