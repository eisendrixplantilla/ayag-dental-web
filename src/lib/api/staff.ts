import { api } from "@/contexts/AuthContext";
import { toKey, toMinutes, toLabel, toValue } from "@/lib/dentistSchedules";
import { manilaTodayDateStr, manilaNowMinutes } from "@/lib/formatDate";
import type { BookedSlot } from "@/lib/api/appointments";

export interface DentistDirectoryEntry {
  id: string;
  name: string;
}

export async function getDentistDirectory(): Promise<DentistDirectoryEntry[]> {
  const data = await api<{ dentists: DentistDirectoryEntry[] }>("/staff?directory=true");
  return data.dentists;
}

export interface StaffMember {
  id: string;
  employeeId: string | null;
  name: string;
  email: string;
  contact: string | null;
  role: "admin" | "dentist" | "superadmin";
  status: string;
  photoUrl: string | null;
  createdAt: string | null;
}

export interface StaffInput {
  employeeId?: string;
  name: string;
  email: string;
  contact?: string;
  role: "admin" | "dentist";
  password: string;
}

export interface StaffUpdate {
  name?: string;
  email?: string;
  contact?: string;
  password?: string;
  status?: string;
  photo?: string;
}

export async function getStaff(): Promise<StaffMember[]> {
  const data = await api<{ staff: StaffMember[] }>("/staff");
  return data.staff;
}

export async function getArchivedStaff(): Promise<StaffMember[]> {
  const data = await api<{ staff: StaffMember[] }>("/staff?archived=true");
  return data.staff;
}

export async function getStaffMember(id: string): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`);
  return data.staff;
}

export async function createStaff(input: StaffInput): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>("/staff", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.staff;
}

export async function updateStaff(id: string, patch: StaffUpdate): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.staff;
}

export async function archiveStaff(id: string): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "archive" }),
  });
  return data.staff;
}

export async function restoreStaff(id: string): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "restore" }),
  });
  return data.staff;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface ScheduleDay {
  dayOfWeek: number; // 0 = Sunday
  start: string;
  end: string;
  lunchStart: string | null;
  lunchEnd: string | null;
  duration: number;
  maxPatients: number;
}

export interface UnavailableDate {
  id: string;
  date: string;
  reason: string | null;
  remarks: string | null;
}

export interface DentistScheduleData {
  days: ScheduleDay[];
  unavailable: UnavailableDate[];
}

export async function getDentistSchedule(dentistId: string): Promise<DentistScheduleData> {
  return api<DentistScheduleData>(`/staff?schedule=true&dentistId=${encodeURIComponent(dentistId)}`);
}

export async function saveDentistScheduleDays(dentistId: string, days: ScheduleDay[]): Promise<void> {
  await api("/staff?schedule=true", {
    method: "PUT",
    body: JSON.stringify({ dentistId, days }),
  });
}

export async function addDentistUnavailable(
  dentistId: string,
  entry: { date: string; reason?: string; remarks?: string },
): Promise<UnavailableDate> {
  const data = await api<{ unavailable: UnavailableDate }>("/staff?unavailable=true", {
    method: "POST",
    body: JSON.stringify({ dentistId, ...entry }),
  });
  return data.unavailable;
}

export async function removeDentistUnavailable(id: string): Promise<void> {
  await api(`/staff?unavailable=true&id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Generates bookable start times for a given date from a real dentist schedule, keeping
 * only those where a visit of `durationMinutes` fits: inside working hours, clear of
 * lunch, and clear of what's already booked. Enforces that day's max-patients cap. */
export function generateAvailableSlots(
  schedule: DentistScheduleData,
  date: Date,
  booked: (string | BookedSlot)[],
  durationMinutes?: number,
): { value: string; label: string }[] {
  const key = toKey(date);
  if (schedule.unavailable.some((u) => u.date === key)) return [];

  const day = schedule.days.find((d) => d.dayOfWeek === date.getDay());
  if (!day) return [];
  if (booked.length >= day.maxPatients) return [];

  const remaining = day.maxPatients - booked.length;
  // However long the chosen services need, but never less than one of the dentist's slots.
  const needed = Math.max(durationMinutes ?? day.duration, day.duration);
  // A booking with no end time recorded occupies a single slot.
  const held = booked.map((b) => {
    const from = toMinutes(typeof b === "string" ? b : b.time);
    const end = typeof b === "string" ? null : b.endTime;
    return { from, to: end ? toMinutes(end) : from + day.duration };
  });
  const slots: { value: string; label: string }[] = [];
  const endMin = toMinutes(day.end);
  const lunchStart = day.lunchStart ? toMinutes(day.lunchStart) : null;
  const lunchEnd = day.lunchEnd ? toMinutes(day.lunchEnd) : null;
  // The clinic operates in Manila time, so "is this slot already past" must be judged against
  // the clinic's actual current time, not the browsing device's own clock/timezone.
  const isToday = manilaTodayDateStr() === key;
  const nowMinutes = manilaNowMinutes();

  for (let t = toMinutes(day.start); t + needed <= endMin; t += day.duration) {
    const slotEnd = t + needed;
    if (lunchStart != null && lunchEnd != null && t < lunchEnd && slotEnd > lunchStart) continue;
    if (held.some((b) => t < b.to && slotEnd > b.from)) continue;
    if (isToday && t <= nowMinutes) continue;
    // Once the visit's length is known, the option says when it would finish, so the
    // booker can see what the chosen services actually take up.
    const label = durationMinutes ? `${toLabel(t)} – ${toLabel(slotEnd)}` : toLabel(t);
    slots.push({ value: toValue(t), label });
  }

  return slots.slice(0, remaining);
}

/** Whether a dentist works at all on the given date (has a day row and isn't marked unavailable). */
export function isDentistAvailableOn(schedule: DentistScheduleData, date: Date): boolean {
  const key = toKey(date);
  if (schedule.unavailable.some((u) => u.date === key)) return false;
  return schedule.days.some((d) => d.dayOfWeek === date.getDay());
}
