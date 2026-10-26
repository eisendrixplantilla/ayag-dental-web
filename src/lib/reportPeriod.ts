import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from "date-fns";
import type { Appointment, AptStatus } from "@/lib/api/appointments";
import { SERVICE_SEPARATOR } from "@/lib/services";

/** What the Reports page counts over: a calendar month, a range of dates, or everything. */
export type Period =
  | { kind: "month"; month: string } // "2026-10"
  | { kind: "range"; from: string; to: string } // "2026-10-01" … "2026-10-15"
  | { kind: "all" };

/** Every status, in the order the page lists them; together they make the whole. */
export const STATUSES: AptStatus[] = ["pending", "confirmed", "rescheduled", "completed", "cancelled", "rejected"];

export const STATUS_LABEL: Record<AptStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

/** First and last day ("yyyy-MM-dd") the period covers; none for all time. */
export function periodBounds(p: Period): { from: string; to: string } | null {
  if (p.kind === "all") return null;
  if (p.kind === "range") return p.from <= p.to ? { from: p.from, to: p.to } : { from: p.to, to: p.from };
  const first = parseISO(`${p.month}-01`);
  return { from: format(first, "yyyy-MM-dd"), to: format(addDays(addMonths(first, 1), -1), "yyyy-MM-dd") };
}

/** "October 2026", "Oct 1 – Oct 15, 2026", or "All time". */
export function periodLabel(p: Period): string {
  if (p.kind === "all") return "All time";
  if (p.kind === "month") return format(parseISO(`${p.month}-01`), "MMMM yyyy");
  const b = periodBounds(p)!;
  const from = parseISO(b.from);
  const to = parseISO(b.to);
  if (b.from === b.to) return format(from, "MMM d, yyyy");
  return from.getFullYear() === to.getFullYear()
    ? `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
    : `${format(from, "MMM d, yyyy")} – ${format(to, "MMM d, yyyy")}`;
}

/** The appointments dated inside the period. */
export function inPeriod(appointments: Appointment[], p: Period): Appointment[] {
  const b = periodBounds(p);
  return b ? appointments.filter((a) => a.date >= b.from && a.date <= b.to) : appointments;
}

export function countByStatus(appointments: Appointment[]): Record<AptStatus, number> {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<AptStatus, number>;
  for (const a of appointments) if (a.status in counts) counts[a.status] += 1;
  return counts;
}

/** One bar of the over-time chart: a day or a month, with its count of each status. */
export type TimeBucket = { label: string } & Record<AptStatus, number>;

/** Up to two months is shown a day at a time; anything longer, a month at a time. */
const MAX_DAILY = 62;

export function overTime(appointments: Appointment[], p: Period): TimeBucket[] {
  let b = periodBounds(p);
  if (!b) {
    if (appointments.length === 0) return [];
    const dates = appointments.map((a) => a.date).sort();
    b = { from: dates[0], to: dates[dates.length - 1] };
  }
  const from = parseISO(b.from);
  const to = parseISO(b.to);
  const daily = differenceInCalendarDays(to, from) + 1 <= MAX_DAILY;

  const buckets = new Map<string, TimeBucket>();
  const empty = (label: string) => ({ label, ...countByStatus([]) });
  if (daily) {
    for (let d = from; d <= to; d = addDays(d, 1)) buckets.set(format(d, "yyyy-MM-dd"), empty(format(d, "MMM d")));
  } else {
    for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1)) buckets.set(format(m, "yyyy-MM"), empty(format(m, "MMM yyyy")));
  }
  for (const a of appointments) {
    const bucket = buckets.get(daily ? a.date : a.date.slice(0, 7));
    if (bucket && a.status in bucket) bucket[a.status] += 1;
  }
  return [...buckets.values()];
}

/** Each dentist's appointments, most first. */
export function byDentist(appointments: Appointment[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of appointments) {
    const name = a.dentistName ?? "Unassigned";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The most-booked services, a visit for several counting once for each. */
export function byService(appointments: Appointment[], top = 8): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of appointments) {
    for (const s of a.service.split(SERVICE_SEPARATOR)) {
      const name = s.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top);
}
