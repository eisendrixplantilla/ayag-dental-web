import { format, parseISO } from "date-fns";
import { toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { isWholeDay, type DentistScheduleData } from "@/lib/api/staff";
import { leaveHours, type LeaveRequest } from "@/lib/api/leave";

/** What one person is doing on one day. */
export type DayCell =
  // A working day; `leave` when they're away for some hours of it.
  | { kind: "work"; start: string; end: string; leave?: { hours: string; reason: string | null } }
  | { kind: "leave"; reason: string | null }
  | { kind: "off" };

export function cellFor(schedule: DentistScheduleData | undefined, date: Date): DayCell {
  const away = schedule?.unavailable.filter((u) => u.date === toKey(date)) ?? [];
  const whole = away.find(isWholeDay);
  if (whole) return { kind: "leave", reason: whole.reason };
  const day = schedule?.days.find((d) => d.dayOfWeek === date.getDay());
  if (!day) return { kind: "off" };
  const part = away[0];
  return { kind: "work", start: day.start, end: day.end, ...(part ? { leave: { hours: leaveHours(part)!, reason: part.reason } } : {}) };
}

export const cellText = (c: DayCell) =>
  c.kind === "work" ? `${toLabel(toMinutes(c.start))} – ${toLabel(toMinutes(c.end))}${c.leave ? ` (leave ${c.leave.hours})` : ""}`
    : c.kind === "leave" ? `On leave${c.reason ? ` (${c.reason})` : ""}`
    : "Off";

/** "Nov 3 – Nov 5" or "Nov 3". */
export const leaveDays = (l: Pick<LeaveRequest, "startDate" | "endDate">) => {
  const from = format(parseISO(l.startDate), "MMM d");
  return l.startDate === l.endDate ? from : `${from} – ${format(parseISO(l.endDate), "MMM d")}`;
};
