import { api } from "@/contexts/AuthContext";
import { format, parseISO } from "date-fns";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { formatManilaStamp, manilaTodayDateStr } from "@/lib/formatDate";
import type { UnavailableDate } from "@/lib/api/staff";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

/** A booking on the requested days that still holds the dentist's time. */
export interface LeaveConflict {
  id: string;
  patientName: string;
  date: string;
  time: string;
  status: string;
}

/**
 * The person's ask to change their approved leave: work `dates` after all, or (leave for
 * part of a day) keep only `startTime`–`endTime`. The superadmin approves or rejects it;
 * the last one stays, so its outcome can be shown.
 */
export interface LeaveChange {
  dates: string[];
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
}

export interface LeaveRequest {
  id: string;
  /** Whoever asked, dentist or admin (the field keeps its first name). */
  dentistId: string;
  dentistName: string;
  role: "dentist" | "admin";
  startDate: string; // yyyy-MM-dd
  endDate: string;
  /** Part of the day only ("HH:MM", one-day leave); both null for whole days. */
  startTime: string | null;
  endTime: string | null;
  reason: string;
  note: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  /** Why it was rejected. */
  decisionReason: string | null;
  /** Days the superadmin took off it after approval (freed again), sorted. */
  removedDates: string[];
  changedBy: string | null;
  changedAt: string | null;
  changeRequest?: LeaveChange | null;
  createdAt: string;
  updatedAt: string;
  /** While pending: what has to be moved before it can be approved. */
  conflicts: LeaveConflict[];
}

/** The reasons offered when asking for leave. */
export const LEAVE_REASONS = ["Sick leave", "Vacation", "Seminar / Training", "Personal", "Emergency", "Other"];

/** Fired after leave changes, so the bell and the lists refresh straight away. */
export const LEAVE_CHANGED = "leave:changed";
const announce = () => window.dispatchEvent(new Event(LEAVE_CHANGED));

/** A dentist's own requests; the superadmin's (all, or one dentist's); the admin's approved ones to come. */
export async function getLeave(dentistId?: string): Promise<LeaveRequest[]> {
  const q = dentistId ? `&dentistId=${encodeURIComponent(dentistId)}` : "";
  const data = await api<{ leave: LeaveRequest[] }>(`/staff?leave=true${q}`);
  return data.leave;
}

/** `staffId`: the superadmin filing it for a dentist or admin (approved at once if nothing is in the way). */
export async function requestLeave(input: {
  startDate: string; endDate: string; startTime?: string; endTime?: string; reason: string; note?: string; staffId?: string;
}): Promise<LeaveRequest> {
  const data = await api<{ leave: LeaveRequest }>("/staff?leave=true", { method: "POST", body: JSON.stringify(input) });
  announce();
  return data.leave;
}

async function decide(id: string, body: Record<string, unknown>): Promise<LeaveRequest> {
  const data = await api<{ leave: LeaveRequest }>(`/staff?leave=true&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  announce();
  return data.leave;
}

export const cancelLeave = (id: string) => decide(id, { action: "cancel" });
export const approveLeave = (id: string) => decide(id, { action: "approve" });
export const rejectLeave = (id: string, reason: string) => decide(id, { action: "reject", reason });
/** Takes days off approved leave (superadmin); with none left it becomes cancelled. */
export const removeLeaveDays = (id: string, dates: string[]) => decide(id, { action: "remove_days", dates });

/** Cuts approved part-day leave to fewer hours (superadmin, directly). */
export const shortenLeave = (id: string, startTime: string, endTime: string) => decide(id, { action: "shorten", startTime, endTime });

/** Asks to change approved leave: days to work after all, or fewer hours of a part-day leave. */
export const requestLeaveChange = (id: string, change: { dates: string[] } | { startTime: string; endTime: string }, note?: string) =>
  decide(id, { action: "request_change", ...change, note });
export const cancelLeaveChange = (id: string) => decide(id, { action: "cancel_change" });
export const approveLeaveChange = (id: string) => decide(id, { action: "approve_change" });
export const rejectLeaveChange = (id: string, reason: string) => decide(id, { action: "reject_change", reason });

/** The change waiting for the superadmin, if any (only approved leave can have one). */
export function pendingChange(l: LeaveRequest): LeaveChange | null {
  return l.status === "approved" && l.changeRequest?.status === "pending" ? l.changeRequest : null;
}

/** What a change asks for: "work Nov 3, Nov 4" or "leave only 1:00 PM – 3:00 PM". */
export function describeChange(c: LeaveChange): string {
  return c.dates.length
    ? `work ${c.dates.map((d) => format(parseISO(d), "MMM d")).join(", ")}`
    : `leave only ${leaveHours(c)}`;
}

/** "1:00 PM – 5:00 PM" for leave (or a day off) covering part of a day; null for whole days. */
export function leaveHours(l: { startTime?: string | null; endTime?: string | null }): string | null {
  return l.startTime && l.endTime ? `${toLabel(toMinutes(l.startTime))} – ${toLabel(toMinutes(l.endTime))}` : null;
}

/** Every day a leave spans ("yyyy-MM-dd"), removed ones included. */
export function leaveSpan(l: Pick<LeaveRequest, "startDate" | "endDate">): string[] {
  const out: string[] = [];
  for (let d = new Date(`${l.startDate}T00:00:00Z`); d <= new Date(`${l.endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** One line of a person's leave: a request, or a day off the clinic set directly. */
export type LeaveLine =
  | { kind: "request"; key: string; sortDate: string; l: LeaveRequest }
  | { kind: "dayOff"; key: string; sortDate: string; d: UnavailableDate };

/** Requests (newest first), then days off set directly that no approved leave covers (latest day first). */
export function leaveLines(list: LeaveRequest[] | null, daysOff: UnavailableDate[]): LeaveLine[] | null {
  if (!list) return null;
  const covered = new Set(list.filter((l) => l.status === "approved")
    .flatMap((l) => leaveSpan(l).filter((d) => !l.removedDates.includes(d))));
  return [
    ...list.map((l): LeaveLine => ({ kind: "request", key: l.id, sortDate: l.createdAt, l })),
    ...daysOff.filter((d) => !covered.has(d.date)).map((d): LeaveLine => ({ kind: "dayOff", key: `off-${d.id}`, sortDate: d.date, d })),
  ].sort((a, b) =>
    // The newest request always on top; days off the clinic set (which carry no time
    // they were added) after the requests, latest day first.
    Number(a.kind === "dayOff") - Number(b.kind === "dayOff") || b.sortDate.localeCompare(a.sortDate));
}

/** "Nov 3 – Nov 5" or "Nov 3", with the year when it isn't this one. */
export function shortRange(from: string, to: string): string {
  const year = manilaTodayDateStr().slice(0, 4);
  const f = (d: string, withYear: boolean) => format(parseISO(d), withYear ? "MMM d, yyyy" : "MMM d");
  const otherYear = to.slice(0, 4) !== year;
  return from === to ? f(from, otherYear) : `${f(from, false)} – ${f(to, otherYear)}`;
}

/** The leave table's columns on paper, and one line of it: what the screen shows, as text. */
export const LEAVE_PRINT_COLUMNS = ["Dates", "Leave For", "Reason", "Requested", "Status"];
export function leavePrintRow(line: LeaveLine): string[] {
  if (line.kind === "dayOff") {
    const d = line.d;
    return [shortRange(d.date, d.date), leaveHours(d) ?? "Whole day", d.reason || "—", "Set by the clinic", "Day off"];
  }
  const l = line.l;
  const days = leaveSpan(l).length;
  const removed = l.removedDates.length ? ` (${l.removedDates.length} removed)` : "";
  const change = l.changeRequest?.status === "pending" && l.status === "approved" ? ` · change pending: ${describeChange(l.changeRequest)}` : "";
  return [
    shortRange(l.startDate, l.endDate),
    (leaveHours(l) ?? `${days} day${days === 1 ? "" : "s"}`) + removed,
    l.reason + (l.status === "rejected" && l.decisionReason ? ` (rejected: ${l.decisionReason})` : ""),
    formatManilaStamp(l.createdAt),
    l.status.charAt(0).toUpperCase() + l.status.slice(1) + change,
  ];
}
