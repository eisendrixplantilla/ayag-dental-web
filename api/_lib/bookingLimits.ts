import { sql } from "./db.js";
import { displayService } from "./services.js";
import { joinName } from "./name.js";

/** Statuses that hold a dentist's time, and so count against a day's limits. */
export const HOLDING = ["pending", "confirmed", "rescheduled"];

/** How a visit's services are joined in `appointments.service`. */
const SEPARATOR = ", ";

/** The services one booking covers, each under its current spelling. */
export const servicesOf = (service: string | null | undefined): string[] =>
  String(service ?? "").split(SEPARATOR).map((s) => displayService(s.trim())).filter(Boolean);

/**
 * The live database isn't migrated on deploy, so the booking tables and the calendar-style
 * column are added on first use (once per instance). Each statement is a no-op once
 * it has run; a failure is retried on the next request.
 */
let ready: Promise<void> | null = null;
export function ensureBookingTables(): Promise<void> {
  ready ??= (async () => {
    await sql`/* booking-limits-table */
      CREATE TABLE IF NOT EXISTS dentist_service_limits (
        dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_name TEXT NOT NULL,
        daily_limit INTEGER NOT NULL CHECK (daily_limit > 0),
        PRIMARY KEY (dentist_id, service_name)
      )`;
    await sql`/* calendar-style-column */
      ALTER TABLE clinic_info ADD COLUMN IF NOT EXISTS calendar_style TEXT NOT NULL DEFAULT 'detailed'`;
    await sql`/* dentist-services-table */
      CREATE TABLE IF NOT EXISTS dentist_services (
        dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_name TEXT NOT NULL,
        PRIMARY KEY (dentist_id, service_name)
      )`;
    await sql`/* service-hours-table */
      CREATE TABLE IF NOT EXISTS dentist_service_hours (
        dentist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_name TEXT NOT NULL,
        days INTEGER[] NOT NULL DEFAULT '{}',
        start_time TEXT,
        end_time TEXT,
        PRIMARY KEY (dentist_id, service_name)
      )`;
    await sql`/* service-day-limits-column */
      ALTER TABLE dentist_service_hours ADD COLUMN IF NOT EXISTS day_limits JSONB NOT NULL DEFAULT '{}'`;
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** A dentist's id. Older bookings may only name the dentist, so it's looked up from the
 * name when that's all there is. */
async function resolveDentistId(dentistId: string | null, dentistName: string | null): Promise<string | null> {
  if (dentistId) return dentistId;
  if (!dentistName) return null;
  const dentists = await sql`/* dentists-by-name */
    SELECT id, first_name, middle_name, last_name FROM users WHERE role = 'dentist'`;
  return (dentists as { id: string; first_name: string; middle_name: string | null; last_name: string }[])
    .find((d) => joinName(d.first_name, d.middle_name, d.last_name) === dentistName)?.id ?? null;
}

/** A dentist's daily limits, by service name. */
export async function limitsFor(dentistId: string | null, dentistName: string | null): Promise<Map<string, number>> {
  await ensureBookingTables();
  const id = await resolveDentistId(dentistId, dentistName);
  if (!id) return new Map();
  const rows = await sql`/* service-limits */
    SELECT service_name, daily_limit FROM dentist_service_limits WHERE dentist_id = ${id}`;
  return new Map((rows as { service_name: string; daily_limit: number }[])
    .map((r) => [displayService(r.service_name), Number(r.daily_limit)]));
}

/** How many of each service a dentist already has booked on a date. */
export async function serviceCountsOn(opts: {
  dentistId: string | null; dentistName: string | null; date: string; excludeId?: string | null;
}): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT service /* day-service-counts */ FROM appointments
    WHERE date = ${opts.date}
      AND status = ANY(${HOLDING}::text[])
      AND (dentist_id = ${opts.dentistId} OR dentist_name = ${opts.dentistName})
      AND (${opts.excludeId ?? null}::uuid IS NULL OR id <> ${opts.excludeId ?? null}::uuid)`;
  const counts = new Map<string, number>();
  for (const r of rows as { service: string }[]) {
    for (const s of new Set(servicesOf(r.service))) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return counts;
}

/**
 * Why a booking can't go on this dentist's day — one of its services has reached the
 * dentist's daily limit — or null when it can. The booking pages only offer days with
 * room, but two people can book the last one at once, and the API can be called
 * directly, so the server has the final word.
 */
export async function overLimit(opts: {
  dentistId: string | null; dentistName: string | null; date: string; service: string; excludeId?: string | null;
}): Promise<string | null> {
  if (!opts.dentistId && !opts.dentistName) return null;
  const [limits, rules] = await Promise.all([
    limitsFor(opts.dentistId, opts.dentistName), hoursFor(opts.dentistId, opts.dentistName),
  ]);
  // A number set for this day of the week wins over the dentist's every-day one.
  const weekday = String(new Date(`${opts.date}T00:00:00Z`).getUTCDay());
  const limitOf = (s: string) => rules.find((r) => r.service === s)?.dayLimits[weekday] ?? limits.get(s);
  const wanted = servicesOf(opts.service).filter((s) => limitOf(s) !== undefined);
  if (!wanted.length) return null;
  const counts = await serviceCountsOn(opts);
  const full = wanted.find((s) => (counts.get(s) ?? 0) >= (limitOf(s) ?? Infinity));
  if (!full) return null;
  const who = opts.dentistName ? ` with ${opts.dentistName}` : "";
  const onDay = rules.find((r) => r.service === full)?.dayLimits[weekday] !== undefined;
  const per = onDay ? `${limitOf(full)} on ${DAY_NAMES[Number(weekday)]}s` : `${limitOf(full)} per day`;
  return `${full} is fully booked${who} on that day (${per}). Please choose another date.`;
}

/** The services a dentist offers, or null when they offer every service (none chosen). */
export async function offeredBy(dentistId: string | null, dentistName: string | null): Promise<Set<string> | null> {
  await ensureBookingTables();
  const id = await resolveDentistId(dentistId, dentistName);
  if (!id) return null;
  const rows = await sql`/* offered-services */ SELECT service_name FROM dentist_services WHERE dentist_id = ${id}`;
  if (!rows.length) return null;
  return new Set((rows as { service_name: string }[]).map((r) => displayService(r.service_name)));
}

/** Why this dentist can't take this booking — they don't offer one of its services — or
 * null when they can. The booking pages only offer dentists who do, but the API can be
 * called directly, so the server checks too. */
export async function notOffered(opts: {
  dentistId: string | null; dentistName: string | null; service: string;
}): Promise<string | null> {
  if (!opts.dentistId && !opts.dentistName) return null;
  const offered = await offeredBy(opts.dentistId, opts.dentistName);
  if (!offered) return null;
  const missing = servicesOf(opts.service).find((s) => !offered.has(s));
  if (!missing) return null;
  const who = opts.dentistName ?? "This dentist";
  return `${who} doesn't offer ${missing}. Please choose another dentist for it.`;
}

/** When a dentist does one service: on these days of the week (0 = Sunday; none = any
 * day they work), between these times ("HH:MM"; null = their whole day), and how many of
 * it they take on each of those days (by day number; a day left out has no limit). */
export interface ServiceHours {
  service: string;
  days: number[];
  start: string | null;
  end: string | null;
  dayLimits: Record<string, number>;
}

type ServiceHoursRow = {
  service_name: string; days: number[] | null; start_time: string | null; end_time: string | null;
  day_limits?: Record<string, unknown> | string | null;
};

export const mapServiceHours = (r: ServiceHoursRow): ServiceHours => {
  const raw = typeof r.day_limits === "string" ? JSON.parse(r.day_limits) : (r.day_limits ?? {});
  return {
    service: displayService(r.service_name),
    days: (r.days ?? []).map(Number).sort((a, b) => a - b),
    start: r.start_time || null,
    end: r.end_time || null,
    dayLimits: Object.fromEntries(Object.entries(raw as Record<string, unknown>)
      .map(([d, n]) => [d, Number(n)] as const)
      .filter(([, n]) => Number.isInteger(n) && n > 0)),
  };
};

/** The days and hours a dentist keeps for particular services. */
export async function hoursFor(dentistId: string | null, dentistName: string | null): Promise<ServiceHours[]> {
  await ensureBookingTables();
  const id = await resolveDentistId(dentistId, dentistName);
  if (!id) return [];
  const rows = await sql`/* service-hours */
    SELECT service_name, days, start_time, end_time, day_limits FROM dentist_service_hours WHERE dentist_id = ${id}`;
  return (rows as ServiceHoursRow[]).map(mapServiceHours);
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const minutesOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const clock = (t: string) => {
  const min = minutesOf(t);
  const h = Math.floor(min / 60), m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** "Mon, Wed · 9:00 AM–12:00 PM", as the error message puts it. */
export const describeServiceHours = (h: ServiceHours) => [
  h.days.length ? h.days.map((d) => SHORT_DAYS[d]).join(", ") : null,
  h.start && h.end ? `${clock(h.start)}–${clock(h.end)}` : null,
].filter(Boolean).join(" · ");

/**
 * Why a booking can't go at this time — one of its services is kept for other days or
 * hours by this dentist (e.g. Veneers only Mon & Wed mornings) — or null when it can.
 * The booking pages only offer days and times that fit; the server checks too.
 */
export async function outsideServiceHours(opts: {
  dentistId: string | null; dentistName: string | null; date: string; time: string; endTime: string | null; service: string;
}): Promise<string | null> {
  if (!opts.dentistId && !opts.dentistName) return null;
  const rules = await hoursFor(opts.dentistId, opts.dentistName);
  if (!rules.length) return null;
  const weekday = new Date(`${opts.date}T00:00:00Z`).getUTCDay();
  const from = minutesOf(opts.time);
  const to = opts.endTime ? minutesOf(opts.endTime) : from + 30;
  const wanted = servicesOf(opts.service);
  const broken = rules.find((r) => wanted.includes(r.service) && (
    (r.days.length > 0 && !r.days.includes(weekday))
    || (r.start && from < minutesOf(r.start))
    || (r.end && to > minutesOf(r.end))
  ));
  if (!broken) return null;
  const who = opts.dentistName ? ` with ${opts.dentistName}` : "";
  return `${broken.service}${who} is only available ${describeServiceHours(broken)}. Please choose another date or time.`;
}
