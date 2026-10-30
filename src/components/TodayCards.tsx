import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ListChecks, type LucideIcon, Stethoscope } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/api/appointments";
import { generateAvailableSlots, type DentistScheduleData } from "@/lib/api/staff";
import { formatTimeRange, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { manilaNowMinutes, manilaTodayAsLocalDate, manilaTodayDateStr } from "@/lib/formatDate";
import { cellFor, cellText, type DayCell } from "@/lib/staffDay";

/*
 * Cards about today, for the people running it: which dentists can still take someone
 * (the front desk), and today's patients in order with where each one stands.
 */

const HOLDING = ["pending", "confirmed", "rescheduled"];
const DEFAULT_MINUTES = 30;

export function CardHead({ icon: Icon, title, extra, link }: {
  icon: LucideIcon; title: string; extra?: React.ReactNode; link?: { to: string; label: string; state?: unknown };
}) {
  return (
    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2">
      {/* A long title wraps rather than losing its end in a narrow column. */}
      <CardTitle className="font-heading text-base flex items-start gap-2 min-w-0 leading-snug">
        <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" /> <span className="min-w-0">{title}</span>
        {extra}
      </CardTitle>
      {link && <Link to={link.to} state={link.state} className="text-sm text-primary hover:underline shrink-0">{link.label}</Link>}
    </CardHeader>
  );
}

const Empty = ({ text }: { text: string }) => <p className="py-14 text-center text-sm text-muted-foreground">{text}</p>;

/** Where one of today's appointments stands, from the clock and its status. */
type Stage = "done" | "now" | "late" | "next";
const STAGE: Record<Stage, { label: string; className: string }> = {
  done: { label: "Done", className: "bg-success/10 text-success border-success/20" },
  now: { label: "Now", className: "bg-primary/10 text-primary border-primary/30" },
  late: { label: "Past time", className: "bg-warning/10 text-warning border-warning/20" },
  next: { label: "Upcoming", className: "bg-muted text-muted-foreground border-border" },
};
function stageOf(a: Appointment, now: number): Stage {
  if (a.status === "completed") return "done";
  const from = toMinutes(a.time);
  const to = a.endTime ? toMinutes(a.endTime) : from + DEFAULT_MINUTES;
  if (now >= to) return "late";
  return now >= from ? "now" : "next";
}

/** Today's appointments that still stand (not cancelled or rejected), in time order. */
function todays(appointments: Appointment[]) {
  const today = manilaTodayDateStr();
  return appointments
    .filter((a) => a.date === today && a.status !== "cancelled" && a.status !== "rejected")
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

/** Today's patients in order: time, name, what for, and where each one stands. */
function DayList({ list, showDentist }: { list: Appointment[]; showDentist: boolean }) {
  const now = manilaNowMinutes();
  return (
    <ul className="divide-y divide-border max-h-[260px] overflow-y-auto pr-1 -mr-1" aria-label="Today's patients">
      {list.map((a) => {
        const stage = stageOf(a, now);
        return (
          <li key={a.id} className={cn("flex items-center gap-3 py-2.5", stage === "done" && "opacity-70")}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{a.patientName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {a.service} · <span className="font-medium text-foreground tabular-nums">{toLabel(toMinutes(a.time))}</span>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {showDentist ? `${a.dentistName ?? "Unassigned"} · ` : ""}{a.type === "walk-in" ? "Walk-in" : "Online"}
              </p>
            </div>
            <Badge variant="outline" className={cn("shrink-0", STAGE[stage].className)}>{STAGE[stage].label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** The front desk's list for today: every patient in order, and how many are done. */
export function CheckInList({ appointments }: { appointments: Appointment[] }) {
  const list = useMemo(() => todays(appointments), [appointments]);
  const done = list.filter((a) => a.status === "completed").length;
  return (
    <Card className="shadow-card min-w-0">
      <CardHead icon={ListChecks} title="Today's Check-in List" link={{ to: "/admin/appointments", label: "Appointments" }} />
      <CardContent>
        <p className="-mt-1 mb-2 text-sm text-muted-foreground">{list.length ? `${done} of ${list.length} done` : "Nobody booked today"}</p>
        {list.length === 0 ? <Empty text="No appointments today." /> : <DayList list={list} showDentist />}
      </CardContent>
    </Card>
  );
}

/** For the front desk: each dentist's hours today, how many they have, and their next
 * free time, so a walk-in can go to whoever can see them. Working first. */
export function DentistsToday({ dentists, schedules, appointments }: {
  dentists: { id: string; name: string }[];
  schedules: Record<string, DentistScheduleData>;
  appointments: Appointment[];
}) {
  const rows = useMemo(() => {
    const date = manilaTodayAsLocalDate();
    const list = todays(appointments);
    const order: Record<DayCell["kind"], number> = { work: 0, leave: 1, off: 2 };
    return dentists.map((d) => {
      const schedule = schedules[d.id];
      const mine = list.filter((a) => a.dentistId === d.id || a.dentistName === d.name);
      const held = mine.filter((a) => HOLDING.includes(a.status)).map((a) => ({ time: a.time, endTime: a.endTime }));
      const cell = cellFor(schedule, date);
      const free = schedule && cell.kind === "work" ? generateAvailableSlots(schedule, date, held)[0]?.label ?? null : null;
      return { d, cell, booked: mine.length, free };
    }).sort((a, b) => order[a.cell.kind] - order[b.cell.kind] || a.d.name.localeCompare(b.d.name));
  }, [dentists, schedules, appointments]);
  const working = rows.filter((r) => r.cell.kind === "work").length;

  return (
    <Card className="shadow-card min-w-0">
      <CardHead icon={Stethoscope} title="Dentists Available Today"
        extra={<span className="text-sm font-normal text-muted-foreground shrink-0">({working})</span>}
        link={{ to: "/admin/schedule", label: "Schedule" }} />
      <CardContent>
        {rows.length === 0 ? <Empty text="No active dentists." /> : (
          <ul className="divide-y divide-border max-h-[260px] overflow-y-auto pr-1 -mr-1" aria-label="Dentists available today">
            {rows.map(({ d, cell, booked, free }) => (
              <li key={d.id} className={cn("flex items-center gap-3 py-2.5", cell.kind !== "work" && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                  <p className={cn("text-xs truncate", cell.kind === "leave" ? "text-warning" : "text-muted-foreground")}>
                    {cellText(cell)}{cell.kind === "work" ? ` · ${booked} booked` : ""}
                  </p>
                </div>
                {cell.kind === "work" && (
                  free ? (
                    <Badge variant="outline" className="shrink-0 bg-success/10 text-success border-success/20">Free {free}</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground">Fully booked</Badge>
                  )
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A dentist's own day: their hours or leave, then their patients in order. */
export function MyScheduleToday({ schedule, appointments }: { schedule: DentistScheduleData | null; appointments: Appointment[] }) {
  const list = useMemo(() => todays(appointments), [appointments]);
  const cell = cellFor(schedule ?? undefined, manilaTodayAsLocalDate());
  const day = schedule?.days.find((d) => d.dayOfWeek === manilaTodayAsLocalDate().getDay());
  const lunch = cell.kind === "work" && day?.lunchStart && day.lunchEnd ? ` · Lunch ${formatTimeRange(day.lunchStart, day.lunchEnd)}` : "";
  const done = list.filter((a) => a.status === "completed").length;
  return (
    <Card className="shadow-card min-w-0">
      <CardHead icon={CalendarClock} title="My Schedule Today" link={{ to: "/dentist/schedule", label: "Schedule" }} />
      <CardContent>
        <p className={cn("-mt-1 text-sm", cell.kind === "leave" ? "text-warning" : "text-muted-foreground")}>
          {schedule ? `${cell.kind === "off" ? "Day off" : cellText(cell)}${lunch}` : "Your hours aren't set yet."}
        </p>
        {list.length > 0 && <p className="mb-2 text-sm text-muted-foreground">{done} of {list.length} done</p>}
        {list.length === 0 ? <Empty text="No patients today." /> : <DayList list={list} showDentist={false} />}
      </CardContent>
    </Card>
  );
}
