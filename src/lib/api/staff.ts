import { api } from "@/contexts/AuthContext";
import { toKey, toMinutes, toLabel, toValue } from "@/lib/dentistSchedules";

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
  role: "admin" | "dentist";
  status: string;
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

/** Generates bookable time-of-day slots for a given date from a real dentist schedule,
 * excluding already-booked times and enforcing that day's max-patients cap. */
export function generateAvailableSlots(
  schedule: DentistScheduleData,
  date: Date,
  bookedTimes: string[],
): { value: string; label: string }[] {
  const key = toKey(date);
  if (schedule.unavailable.some((u) => u.date === key)) return [];

  const day = schedule.days.find((d) => d.dayOfWeek === date.getDay());
  if (!day) return [];
  if (bookedTimes.length >= day.maxPatients) return [];

  const remaining = day.maxPatients - bookedTimes.length;
  const slots: { value: string; label: string }[] = [];
  const endMin = toMinutes(day.end);
  const lunchStart = day.lunchStart ? toMinutes(day.lunchStart) : null;
  const lunchEnd = day.lunchEnd ? toMinutes(day.lunchEnd) : null;
  const now = new Date();
  const isToday = toKey(now) === key;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let t = toMinutes(day.start); t + day.duration <= endMin; t += day.duration) {
    const slotEnd = t + day.duration;
    if (lunchStart != null && lunchEnd != null && t < lunchEnd && slotEnd > lunchStart) continue;
    const value = toValue(t);
    if (bookedTimes.includes(value)) continue;
    if (isToday && t <= nowMinutes) continue;
    slots.push({ value, label: toLabel(t) });
  }

  return slots.slice(0, remaining);
}

/** Whether a dentist works at all on the given date (has a day row and isn't marked unavailable). */
export function isDentistAvailableOn(schedule: DentistScheduleData, date: Date): boolean {
  const key = toKey(date);
  if (schedule.unavailable.some((u) => u.date === key)) return false;
  return schedule.days.some((d) => d.dayOfWeek === date.getDay());
}
