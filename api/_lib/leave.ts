import { sql } from "./db.js";
import { joinName } from "./name.js";

/** Statuses of a booking that hold the dentist's time, so leave can't be approved over them. */
const HOLDING = ["pending", "confirmed", "rescheduled"];

/** The longest leave one request can ask for. */
export const MAX_LEAVE_DAYS = 60;

/**
 * Dentists' requests for time off, approved (or not) by the superadmin. Created on first
 * use, like the booking tables, since the live database isn't migrated on deploy.
 */
let ready: Promise<void> | null = null;
export function ensureLeaveTable(): Promise<void> {
  ready ??= sql`/* leave-requests-table */
    CREATE TABLE IF NOT EXISTS leave_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      decision_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`
    // Days the superadmin later took off an approved leave, and who did it when.
    // ...and leave for part of one day: its hours ("HH:MM"; none = the whole day).
    // ...and the person's own ask to change it once approved (see ChangeRequest).
    .then(() => sql`/* leave-columns */ ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS removed_dates DATE[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS changed_by TEXT,
      ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS start_time TEXT,
      ADD COLUMN IF NOT EXISTS end_time TEXT,
      ADD COLUMN IF NOT EXISTS change_request JSONB`)
    .then(() => ensureUnavailableTimes())
    .then(() => undefined).catch((err) => { ready = null; throw err; });
  return ready;
}

/** An Unavailable Date can cover part of the day (its hours, "HH:MM"); none = the whole day. */
let timesReady: Promise<void> | null = null;
export function ensureUnavailableTimes(): Promise<void> {
  timesReady ??= sql`/* unavailable-times */ ALTER TABLE dentist_unavailable
      ADD COLUMN IF NOT EXISTS start_time TEXT,
      ADD COLUMN IF NOT EXISTS end_time TEXT`
    .then(() => undefined).catch((err) => { timesReady = null; throw err; });
  return timesReady;
}

const day = (v: unknown) => new Date(v as string).toISOString().slice(0, 10);
const minutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

/** "HH:MM" on the 24-hour clock. */
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface LeaveConflict {
  id: string;
  patientName: string;
  date: string;
  time: string;
  status: string;
}

/** The dentist's bookings on those days that still hold their time; with `hours`, only
 * those overlapping them (a booking with no end time takes 30 minutes). */
export async function conflictsFor(
  dentistId: string, dentistName: string, from: string, to: string, hours?: { start: string; end: string } | null,
): Promise<LeaveConflict[]> {
  const rows = await sql`/* leave-conflicts */
    SELECT id, patient_name, date, time, end_time, status FROM appointments
    WHERE (dentist_id = ${dentistId} OR dentist_name = ${dentistName})
      AND date BETWEEN ${from}::date AND ${to}::date
      AND status = ANY(${HOLDING}::text[])
    ORDER BY date, time`;
  return (rows as any[])
    .filter((r) => {
      if (!hours) return true;
      const start = minutes(String(r.time));
      const end = r.end_time ? minutes(String(r.end_time)) : start + 30;
      return start < minutes(hours.end) && end > minutes(hours.start);
    })
    .map((r) => ({ id: r.id, patientName: r.patient_name, date: day(r.date), time: r.time, status: r.status }));
}

/**
 * A dentist's (or admin's) ask to change their approved leave: work some of its days after
 * all (`dates`), or, on leave for part of a day, keep fewer of its hours (`startTime`–
 * `endTime`, inside the old ones). It waits for the superadmin; the leave stays as it was
 * until then. The last one is kept, decided or not, so its outcome can be shown.
 */
export interface ChangeRequest {
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

export function changeOf(r: { change_request?: unknown }): ChangeRequest | null {
  const c = r.change_request;
  if (!c) return null;
  return (typeof c === "string" ? JSON.parse(c) : c) as ChangeRequest;
}

export async function saveChange(id: string, change: ChangeRequest | null) {
  await sql`/* leave-change */ UPDATE leave_requests
    SET change_request = ${change ? JSON.stringify(change) : null}::jsonb, updated_at = now() WHERE id = ${id}`;
}

/**
 * Leave for part of a day, cut to fewer hours: the leave and the Unavailable Date it made
 * (found by its reason, note and old hours) both take the new ones. `changedBy`: the
 * superadmin doing it directly (recorded, so the person hears of it); null at the person's
 * own ask, which their change request records instead.
 */
export async function shortenLeave(
  row: { id: string; dentist_id: string; reason: string; note: string | null; start_date: unknown; start_time: string; end_time: string },
  startTime: string, endTime: string, changedBy: string | null = null,
) {
  await sql`/* leave-unavailable-hours */ UPDATE dentist_unavailable SET start_time = ${startTime}, end_time = ${endTime}
    WHERE dentist_id = ${row.dentist_id} AND unavailable_date = ${day(row.start_date)}
      AND reason = ${row.reason} AND remarks IS NOT DISTINCT FROM ${row.note} AND start_time = ${row.start_time}`;
  await sql`/* leave-hours */ UPDATE leave_requests SET start_time = ${startTime}, end_time = ${endTime},
      changed_by = COALESCE(${changedBy}, changed_by), changed_at = CASE WHEN ${changedBy}::text IS NULL THEN changed_at ELSE now() END,
      updated_at = now()
    WHERE id = ${row.id}`;
}

/** A request as the pages read it, with the bookings in its way while it's still pending. */
export async function mapLeave(r: any) {
  const dentistName = joinName(r.first_name, r.middle_name, r.last_name);
  const startDate = day(r.start_date);
  const endDate = day(r.end_date);
  const hours = r.start_time && r.end_time ? { start: r.start_time as string, end: r.end_time as string } : null;
  return {
    id: r.id,
    dentistId: r.dentist_id,
    dentistName,
    /** Who asked: a dentist or an admin. */
    role: r.role as "dentist" | "admin",
    startDate,
    endDate,
    /** Part of the day only ("HH:MM"); both null for whole days. */
    startTime: hours?.start ?? null,
    endTime: hours?.end ?? null,
    reason: r.reason,
    note: r.note,
    status: r.status,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionReason: r.decision_reason,
    /** Days taken off it after approval: freed again, no longer leave. */
    removedDates: ((r.removed_dates ?? []) as unknown[]).map(day).sort(),
    changedBy: r.changed_by ?? null,
    changedAt: r.changed_at ?? null,
    changeRequest: changeOf(r),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    conflicts: r.status === "pending" ? await conflictsFor(r.dentist_id, dentistName, startDate, endDate, hours) : [],
  };
}

/** Every date from `from` to `to`, both included ("YYYY-MM-DD"). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** The days a leave still covers: its range, less any removed since. */
export function leaveDates(l: { start_date: unknown; end_date: unknown; removed_dates?: unknown[] | null }): string[] {
  const removed = new Set((l.removed_dates ?? []).map(day));
  return datesBetween(day(l.start_date), day(l.end_date)).filter((d) => !removed.has(d));
}

/**
 * Takes days off an approved leave: each stops being an Unavailable Date (only the one the
 * leave made, with its reason and note, not a day off marked for something else), and once
 * no day is left the leave counts as cancelled. `changedBy` null: at the person's own ask,
 * which their change request records instead.
 */
export async function removeLeaveDays(
  row: { id: string; dentist_id: string; reason: string; note: string | null; start_date: unknown; end_date: unknown; removed_dates?: unknown[] | null },
  dates: string[],
  changedBy: string | null,
) {
  for (const date of dates) {
    await sql`/* leave-free-day */ DELETE FROM dentist_unavailable
      WHERE dentist_id = ${row.dentist_id} AND unavailable_date = ${date}
        AND reason = ${row.reason} AND remarks IS NOT DISTINCT FROM ${row.note}`;
  }
  const removed = [...new Set([...((row.removed_dates ?? []) as unknown[]).map(day), ...dates])].sort();
  const status = leaveDates({ ...row, removed_dates: removed }).length > 0 ? "approved" : "cancelled";
  await sql`/* leave-remove-days */ UPDATE leave_requests
    SET removed_dates = ${removed}::date[], status = ${status},
      changed_by = COALESCE(${changedBy}, changed_by), changed_at = CASE WHEN ${changedBy}::text IS NULL THEN changed_at ELSE now() END,
      updated_at = now()
    WHERE id = ${row.id}`;
}

/** The signed-in person's name, as a decision records who made it. */
export async function nameOf(session: { sub: string; email: string }): Promise<string> {
  const [me] = await sql`SELECT first_name, middle_name, last_name FROM users WHERE id = ${session.sub}`;
  return me ? joinName(me.first_name, me.middle_name, me.last_name) : session.email;
}

/**
 * Approves a request: each of its days becomes an Unavailable Date, like one the superadmin
 * adds by hand (a day already marked stays as it was). The caller has checked that no
 * booking holds those days.
 */
export async function approveLeave(
  row: { id: string; dentist_id: string },
  leave: { startDate: string; endDate: string; startTime?: string | null; endTime?: string | null; reason: string; note: string | null },
  decidedBy: string,
) {
  // Leave for part of a day blocks only those hours of it.
  for (const date of datesBetween(leave.startDate, leave.endDate)) {
    await sql`/* leave-unavailable */
      INSERT INTO dentist_unavailable (dentist_id, unavailable_date, reason, remarks, start_time, end_time)
      SELECT ${row.dentist_id}, ${date}, ${leave.reason}, ${leave.note}, ${leave.startTime ?? null}, ${leave.endTime ?? null}
      WHERE NOT EXISTS (SELECT 1 FROM dentist_unavailable WHERE dentist_id = ${row.dentist_id} AND unavailable_date = ${date})`;
  }
  await sql`/* leave-decide */ UPDATE leave_requests
    SET status = 'approved', decided_by = ${decidedBy}, decided_at = now(), updated_at = now() WHERE id = ${row.id}`;
}
