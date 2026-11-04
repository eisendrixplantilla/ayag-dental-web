import type { Appointment } from "@/lib/api/appointments";
import { manilaDateOf } from "@/lib/formatDate";

/** A phone number reduced to its digits, so "0917-123-4567" and "0917 123 4567" are the same. */
export const contactDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/**
 * One walk-in guest: the visits booked with no account under the same name *and* the
 * same contact number. Two different people can share a name, so the name alone isn't
 * enough to tell their visits apart — or to link them to an account.
 */
export interface GuestGroup {
  key: string;
  name: string;
  /** As the desk wrote it (from the newest visit that has one); null when none was taken. */
  contact: string | null;
  /** Visits, newest first. */
  visits: Appointment[];
}

export function groupGuests(appointments: Appointment[]): GuestGroup[] {
  const groups = new Map<string, GuestGroup>();
  const newestFirst = appointments
    .filter(a => !a.patientId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? ""));
  for (const a of newestFirst) {
    const key = `${a.patientName}\u0000${contactDigits(a.contact)}`;
    const group = groups.get(key) ?? { key, name: a.patientName, contact: null, visits: [] };
    group.contact ??= a.contact || null;
    group.visits.push(a);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** How a guest is named in lists: with their number, which is what tells namesakes apart. */
export const guestLabel = (g: Pick<GuestGroup, "name" | "contact">) => (g.contact ? `${g.name} (${g.contact})` : g.name);

/** When the clinic first booked this guest, as a Manila date: what a patient account's
 * sign-up date is to an account holder, so the two can share one newest-first list. */
export function guestSince(g: GuestGroup): string | null {
  const first = g.visits.reduce<string | null>(
    (min, a) => (a.createdAt && (!min || Date.parse(a.createdAt) < Date.parse(min)) ? a.createdAt : min), null);
  return first ? manilaDateOf(first) : null;
}
