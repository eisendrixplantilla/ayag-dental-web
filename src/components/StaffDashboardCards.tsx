import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BarChart3, CalendarRange, UserCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { DecideLeave } from "@/components/LeaveRequests";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/api/appointments";
import type { DentistScheduleData, StaffMember } from "@/lib/api/staff";
import { byNewestAsk, describeChange, leaveHours, pendingChange, type LeaveRequest } from "@/lib/api/leave";
import { manilaTodayAsLocalDate, manilaTodayDateStr } from "@/lib/formatDate";
import { periodLabel, type Period } from "@/lib/reportPeriod";
import { cellFor, cellText, leaveDays, type DayCell } from "@/lib/staffDay";

/*
 * The Super Admin's own cards on the dashboard, in place of the front desk's patient
 * ones: who is working today, the leave waiting for them, and each dentist's share of
 * the period's appointments.
 */

const roleLabel = (r: string) => (r === "dentist" ? "Dentist" : "Admin");
const ORDER: Record<DayCell["kind"], number> = { work: 0, leave: 1, off: 2 };

function Title({ icon: Icon, title, count, link }: { icon: typeof UserCheck; title: string; count?: number; link?: { to: string; label: string } }) {
  return (
    <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2">
      <CardTitle className="font-heading text-base flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" /> {title}
        {count !== undefined && <span className="text-sm font-normal text-muted-foreground">({count})</span>}
      </CardTitle>
      {link && <Link to={link.to} className="text-sm text-primary hover:underline shrink-0">{link.label}</Link>}
    </CardHeader>
  );
}

/** Every active dentist and admin: their hours today, leave or day off, and for a dentist
 * how many appointments they have today. Working first. */
export function StaffOnDuty({ staff, schedules, appointments }: {
  staff: StaffMember[];
  schedules: Record<string, DentistScheduleData>;
  appointments: Appointment[];
}) {
  const today = manilaTodayDateStr();
  const rows = useMemo(() => {
    const date = manilaTodayAsLocalDate();
    return staff
      .filter((s) => (s.role === "dentist" || s.role === "admin") && s.status === "active")
      .map((s) => ({
        s,
        cell: cellFor(schedules[s.id], date),
        booked: s.role === "dentist"
          ? appointments.filter((a) => a.date === today && a.status !== "cancelled" && a.status !== "rejected"
            && (a.dentistId === s.id || a.dentistName === s.name)).length
          : null,
      }))
      .sort((a, b) => ORDER[a.cell.kind] - ORDER[b.cell.kind] || a.s.role.localeCompare(b.s.role) || a.s.name.localeCompare(b.s.name));
  }, [staff, schedules, appointments, today]);
  const working = rows.filter((r) => r.cell.kind === "work").length;

  return (
    <Card className="shadow-card min-w-0">
      <Title icon={UserCheck} title="Staff on Duty Today" count={working} link={{ to: "/superadmin/schedule", label: "Schedule" }} />
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No active staff.</p>
        ) : (
          <ul className="divide-y divide-border max-h-[260px] overflow-y-auto pr-1 -mr-1" aria-label="Staff on duty today">
            {rows.map(({ s, cell, booked }) => (
              <li key={s.id} className={cn("flex items-center gap-3 py-2.5", cell.kind !== "work" && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                  <p className={cn("text-xs truncate", cell.kind === "leave" ? "text-warning" : "text-muted-foreground")}>
                    {roleLabel(s.role)} · {cellText(cell)}
                  </p>
                </div>
                {booked !== null && cell.kind === "work" && (
                  <Badge variant="outline" className="shrink-0 tabular-nums">{booked} appt{booked === 1 ? "" : "s"}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** New leave, and changes asked to approved leave, newest first, with the Super Admin's
 * Approve and Reject. */
export function LeaveApprovals({ leave, className }: { leave: LeaveRequest[]; className?: string }) {
  const pending = leave.filter((l) => l.status === "pending" || pendingChange(l))
    .sort(byNewestAsk);
  return (
    <Card className={cn("shadow-card min-w-0", className)}>
      <Title icon={CalendarRange} title="Leave Requests" count={pending.length} link={{ to: "/superadmin/schedule", label: "All leave" }} />
      <CardContent>
        {pending.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No leave waiting for approval.</p>
        ) : (
          <ul className="divide-y divide-border max-h-[260px] overflow-y-auto pr-1 -mr-1" aria-label="Leave requests">
            {pending.map((l) => (
              <li key={l.id} className="space-y-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {l.dentistName} <span className="text-xs font-normal text-muted-foreground">· {roleLabel(l.role)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {leaveDays(l)}{leaveHours(l) ? `, ${leaveHours(l)}` : ""} · {l.reason}
                  </p>
                  {pendingChange(l) && (
                    <p className="text-xs text-warning">Asks to {describeChange(l.changeRequest!)}</p>
                  )}
                  {pendingChange(l) === null && l.conflicts.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {l.conflicts.length} appointment{l.conflicts.length === 1 ? "" : "s"} to move first
                    </p>
                  )}
                </div>
                <DecideLeave l={l} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const WORKLOAD_CHART: ChartConfig = {
  appointments: { label: "Appointments", color: "hsl(174 45% 68%)" },
  completed: { label: "Completed", color: "hsl(174 72% 28%)" },
};

/** Each dentist's appointments in the period, and how many of them were completed. */
export function DentistWorkload({ appointments, period }: { appointments: Appointment[]; period: Period }) {
  const data = useMemo(() => {
    const by = new Map<string, { name: string; appointments: number; completed: number }>();
    for (const a of appointments) {
      const name = a.dentistName ?? "Unassigned";
      const row = by.get(name) ?? { name, appointments: 0, completed: 0 };
      row.appointments += 1;
      if (a.status === "completed") row.completed += 1;
      by.set(name, row);
    }
    return [...by.values()].sort((a, b) => b.appointments - a.appointments || a.name.localeCompare(b.name));
  }, [appointments]);

  return (
    <Card className="shadow-card min-w-0">
      <Title icon={BarChart3} title="Appointments by Dentist" />
      <CardContent>
        <p className="-mt-1 mb-2 text-sm text-muted-foreground">{periodLabel(period)}</p>
        {data.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No appointments in this period.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-2 text-xs text-foreground" aria-label="Legend">
              {Object.entries(WORKLOAD_CHART).map(([key, c]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: c.color }} /> {c.label}
                </li>
              ))}
            </ul>
            <ChartContainer config={WORKLOAD_CHART} className="aspect-auto w-full" style={{ height: Math.max(140, data.length * 44 + 30) }}>
              <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16 }} barGap={2}>
                <CartesianGrid horizontal={false} />
                <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false}
                  tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Bar dataKey="appointments" fill="var(--color-appointments)" radius={4} maxBarSize={14} />
                <Bar dataKey="completed" fill="var(--color-completed)" radius={4} maxBarSize={14} />
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}
