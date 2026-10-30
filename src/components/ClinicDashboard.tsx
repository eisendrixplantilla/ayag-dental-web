import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ArrowDownRight, ArrowUpRight, CalendarCheck, CalendarDays, Check, ClipboardList, Clock, Eye, Loader2, type LucideIcon, MoreVertical,
  Stethoscope, TrendingUp, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import Segmented from "@/components/Segmented";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  byNewestBooked, confirmAppointment, describeEmailOutcome, rejectAppointment, type Appointment,
} from "@/lib/api/appointments";
import type { Patient } from "@/lib/api/patients";
import { formatTimeRange, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { manilaNowMinutes, manilaTodayDateStr } from "@/lib/formatDate";
import { byService, inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";
import {
  appointmentBars, distinctPatients, joinedSummary, monthlySuccess, percentChange, previousPeriod, successRate, topTreatments,
  type Joined, type Span,
} from "@/lib/dashboardStats";

/** Where a dashboard's links go, per role. */
export interface DashboardLinks {
  /** "View report" under each number. */
  report: string;
  /** "View more" under the patient totals. */
  patients: string;
  /** Label of the report link ("View report", or "View all" where there's no reports page). */
  reportLabel?: string;
}

/** The patient totals at the bottom: what they're called, and when each patient joined
 * (accounts and walk-in guests), from which the card works out the rest. */
export interface PatientTotals {
  monthLabel: string;
  allLabel: string;
  joined: Joined[];
}

const TREND_CHART: ChartConfig = { count: { label: "New patients", color: "hsl(174 72% 33%)" } };
const ACCOUNT_COLOR = "hsl(174 72% 33%)";
const GUEST_COLOR = "hsl(38 92% 50%)";

const BAR_CHART: ChartConfig = {
  appointments: { label: "Appointments", color: "hsl(174 45% 68%)" },
  completed: { label: "Completed", color: "hsl(174 72% 28%)" },
};
/** Top services in fixed order, then the rest in grey. */
const SLICE_COLORS = ["hsl(174 72% 33%)", "hsl(239 70% 62%)", "hsl(38 92% 50%)", "hsl(var(--muted-foreground) / 0.45)"];
const LINE_CHART: ChartConfig = { rate: { label: "Success rate", color: "hsl(174 72% 33%)" } };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/**
 * The dashboard frame shared by the front desk, the Super Admin and each dentist: four
 * numbers for the period with their change, the appointments by week, month or year, how
 * many visits were completed, and the patient totals. Each role brings its own cards for
 * the rest (`middle`, `bottomLeft`), from the ones exported here and its own.
 * `appointments` are the ones this person sees (a dentist's own).
 */
export default function ClinicDashboard({ appointments, period, links, patientTotals, middle, bottomLeft }: {
  appointments: Appointment[];
  period: Period;
  links: DashboardLinks;
  patientTotals: PatientTotals;
  /** Each role's own three cards for the middle row (the third spans the row on a tablet). */
  middle: [React.ReactNode, React.ReactNode, React.ReactNode];
  /** And its own card for the bottom row's first place, beside Success Stats and the totals. */
  bottomLeft: React.ReactNode;
}) {
  const today = manilaTodayDateStr();
  const shown = useMemo(() => inPeriod(appointments, period), [appointments, period]);
  const before = useMemo(() => {
    const p = previousPeriod(period);
    return p ? inPeriod(appointments, p) : null;
  }, [appointments, period]);

  const count = (list: Appointment[] | null, keep: (a: Appointment) => boolean = () => true) =>
    list ? list.filter(keep).length : null;
  const completed = (a: Appointment) => a.status === "completed";
  const pending = (a: Appointment) => a.status === "pending";
  const stats: { title: string; icon: LucideIcon; value: number; was: number | null }[] = [
    { title: "Total Patients", icon: Users, value: distinctPatients(shown), was: before ? distinctPatients(before) : null },
    { title: "Consultations", icon: Stethoscope, value: count(shown, completed)!, was: count(before, completed) },
    { title: "Appointments", icon: CalendarDays, value: shown.length, was: count(before) },
    { title: "Pending Requests", icon: Clock, value: count(shown, pending)!, was: count(before, pending) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {stats.map((s) => (
            <StatTile key={s.title} {...s} change={percentChange(s.value, s.was)} link={links.report} linkLabel={links.reportLabel ?? "View report"} />
          ))}
        </div>
        <AppointmentChart appointments={appointments} today={today} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {middle[0]}
        {middle[1]}
        <div className="md:col-span-2 xl:col-span-1 min-w-0 [&>*]:h-full">{middle[2]}</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {bottomLeft}
        <SuccessStats appointments={appointments} shown={shown} before={before} today={today} />
        <PatientTotalsCard totals={patientTotals} link={links.patients} className="md:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}

function CardTitleRow({ icon: Icon, title, extra }: { icon: LucideIcon; title: string; extra?: React.ReactNode }) {
  return (
    <CardTitle className="font-heading text-base flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" /> {title}
      {extra}
    </CardTitle>
  );
}

function StatTile({ title, icon: Icon, value, change, link, linkLabel }: {
  title: string; icon: LucideIcon; value: number; change: number | null; link: string; linkLabel: string;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <Card className="shadow-card">
      <CardContent className="p-3.5 sm:p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground leading-tight">{title}</p>
            <p className="text-xl sm:text-2xl font-bold font-heading leading-tight">{value}</p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
          {change === null ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-success" : "text-destructive")}
              title="Change from the period before">
              {up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {Math.abs(change)}%
            </span>
          )}
          <Button asChild variant="outline" size="sm" className="h-7 px-2.5 text-xs text-primary border-primary/40">
            <Link to={link}>{linkLabel}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AppointmentChart({ appointments, today }: { appointments: Appointment[]; today: string }) {
  const [span, setSpan] = useState<Span>("monthly");
  const data = useMemo(() => appointmentBars(appointments, span, today), [appointments, span, today]);
  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2 flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitleRow icon={CalendarCheck} title="Appointment" />
        <Segmented label="Chart span" size="sm" value={span} onChange={setSpan}
          options={[{ value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
      </CardHeader>
      <CardContent>
        {/* The legend sits outside the plot, so it lines up with the title, not the axis. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 pb-3 text-xs text-foreground" aria-label="Legend">
          {Object.entries(BAR_CHART).map(([key, c]) => (
            <li key={key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: c.color }} /> {c.label}
            </li>
          ))}
        </ul>
        <ChartContainer config={BAR_CHART} className="aspect-auto h-[210px] w-full">
          <BarChart data={data} margin={{ left: -16, right: 8 }} barGap={2}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={8} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="appointments" fill="var(--color-appointments)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function TopTreatments({ appointments, period }: { appointments: Appointment[]; period: Period }) {
  const slices = useMemo(() => topTreatments(byService(appointments, Infinity)), [appointments]);
  const total = slices.reduce((n, s) => n + s.count, 0);
  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2">
        <CardTitleRow icon={ClipboardList} title="Top Treatments" />
        <p className="text-sm text-muted-foreground">{periodLabel(period)}</p>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No treatments in this period.</p>
        ) : (
          <div className="flex flex-col sm:flex-row md:flex-col 2xl:flex-row items-center gap-4">
            <ChartContainer config={{}} className="aspect-square w-[160px] shrink-0">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie data={slices} dataKey="count" nameKey="name" innerRadius={44} outerRadius={76} strokeWidth={2}>
                  {slices.map((s, i) => <Cell key={s.name} fill={SLICE_COLORS[s.name === "Others" ? 3 : i]} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <ul className="w-full space-y-1.5 text-sm" aria-label="Top treatments">
              {slices.map((s, i) => (
                <li key={s.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SLICE_COLORS[s.name === "Others" ? 3 : i] }} />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function NextPatient({ appointments, patients }: { appointments: Appointment[]; patients: Patient[] }) {
  const today = manilaTodayDateStr();
  const next = useMemo(() => {
    const now = manilaNowMinutes();
    return appointments
      .filter((a) => (a.status === "confirmed" || a.status === "rescheduled")
        && (a.date > today || (a.date === today && toMinutes(a.time) >= now)))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] ?? null;
  }, [appointments, today]);
  const patient = next?.patientId ? patients.find((p) => p.id === next.patientId) ?? null : null;
  // The last visit before this one: the patient's most recent completed appointment.
  const lastVisit = next
    ? appointments
      .filter((a) => a.status === "completed" && a.id !== next.id
        && (next.patientId ? a.patientId === next.patientId : a.patientName === next.patientName))
      .map((a) => a.date).sort().at(-1) ?? null
    : null;

  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2">
        <CardTitleRow icon={Users} title="Next Patient Details" />
      </CardHeader>
      <CardContent>
        {!next ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No approved appointments coming up.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              {patient?.photoUrl ? (
                <img src={patient.photoUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-secondary text-primary font-semibold flex items-center justify-center shrink-0">
                  {initials(next.patientName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{next.patientName}</p>
                <p className="text-sm text-muted-foreground truncate">{next.service}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Detail label="Patient ID" value={patient?.code ?? "—"} />
              <Detail label="Schedule" value={`${format(parseISO(next.date), "MMM d, yyyy")}`} sub={formatTimeRange(next.time, next.endTime)} />
              <Detail label="Gender" value={patient?.gender ?? next.gender ?? "—"} capitalize />
              <Detail label="Age" value={String(patient?.age ?? next.age ?? "—")} />
              <Detail label="Last Visit" value={lastVisit ? format(parseISO(lastVisit), "MMM d, yyyy") : "First visit"} />
              <Detail label="Booking" value={next.type === "walk-in" ? "Walk-in" : "Online"} />
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value, sub, capitalize }: { label: string; value: string; sub?: string; capitalize?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-foreground">{label}</dt>
      <dd className={cn("text-muted-foreground truncate", capitalize && "capitalize")}>{value}</dd>
      {sub && <dd className="text-xs text-muted-foreground truncate">{sub}</dd>}
    </div>
  );
}

export function ApprovalRequests({ appointments, onChanged }: { appointments: Appointment[]; onChanged: () => void }) {
  const today = manilaTodayDateStr();
  const requests = useMemo(
    // Newest request on top, whichever day it is for.
    () => appointments.filter((a) => a.status === "pending" && a.date >= today).sort(byNewestBooked),
    [appointments, today],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Appointment | null>(null);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [reason, setReason] = useState("");

  const approve = async (a: Appointment) => {
    setBusy(a.id);
    try {
      const result = await confirmAppointment(a.id);
      const email = describeEmailOutcome(result, "Confirmation");
      (email.ok ? toast.success : toast.warning)("Appointment approved", { description: email.text });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm appointment");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    if (!rejecting || !reason.trim()) return;
    setBusy(rejecting.id);
    try {
      const result = await rejectAppointment(rejecting.id, reason.trim());
      const email = describeEmailOutcome(result, "Rejection");
      (email.ok ? toast.success : toast.warning)("Appointment rejected", { description: email.text });
      setRejecting(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject appointment");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2">
        <CardTitleRow icon={Clock} title="Approval Requests"
          extra={requests.length > 0 && <span className="text-sm font-normal text-muted-foreground">({requests.length})</span>} />
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No requests waiting for approval.</p>
        ) : (
          <ul className="divide-y divide-border max-h-[248px] overflow-y-auto pr-1 -mr-1" aria-label="Approval requests">
            {requests.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.service}</p>
                  <p className="text-xs text-muted-foreground tabular-nums truncate">
                    {format(parseISO(a.date), "EEE, MMM d")} · {toLabel(toMinutes(a.time))}
                  </p>
                </div>
                {/* One menu, so the patient's name keeps the row's width. */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label={`Options for ${a.patientName}`} disabled={busy !== null}
                      className="h-8 w-8 shrink-0 text-muted-foreground">
                      {busy === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-success focus:text-success" onClick={() => approve(a)}>
                      <Check className="w-4 h-4 mr-2" /> Approve
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => { setReason(""); setRejecting(a); }}>
                      <X className="w-4 h-4 mr-2" /> Reject
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setViewing(a)}>
                      <Eye className="w-4 h-4 mr-2" /> View details
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Reject Appointment</DialogTitle>
            <DialogDescription>
              {rejecting && `${rejecting.patientName} · ${rejecting.service} · ${format(parseISO(rejecting.date), "MMM d, yyyy")}`}.
              The patient is emailed the reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dash-reject-reason">Reason</Label>
            <Textarea id="dash-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={!reason.trim() || busy !== null}>Reject & Notify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Appointment Request</DialogTitle>
            <DialogDescription>{viewing?.reference ?? "Waiting for approval"}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Detail label="Patient" value={viewing.patientName} />
              <Detail label="Contact" value={viewing.contact || "—"} />
              <Detail label="Service" value={viewing.service} />
              <Detail label="Dentist" value={viewing.dentistName ?? "—"} />
              <Detail label="Date" value={format(parseISO(viewing.date), "MMM d, yyyy")} />
              <Detail label="Time" value={formatTimeRange(viewing.time, viewing.endTime)} />
              <Detail label="Booking" value={viewing.type === "walk-in" ? "Walk-in" : "Online"} />
              <Detail label="Email" value={viewing.email || "—"} />
            </dl>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" className="text-destructive" disabled={busy !== null}
              onClick={() => { const a = viewing!; setViewing(null); setReason(""); setRejecting(a); }}>
              <X className="w-4 h-4 mr-1" /> Reject
            </Button>
            <Button disabled={busy !== null} onClick={() => { const a = viewing!; setViewing(null); approve(a); }}>
              <Check className="w-4 h-4 mr-1" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function TodaysAppointments({ appointments }: { appointments: Appointment[] }) {
  const today = manilaTodayDateStr();
  const list = useMemo(
    () => appointments.filter((a) => a.date === today && a.status !== "cancelled" && a.status !== "rejected")
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time)),
    [appointments, today],
  );
  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2">
        <CardTitleRow icon={CalendarDays} title="Today's Appointments"
          extra={<span className="text-sm font-normal text-muted-foreground">({list.length})</span>} />
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">No appointments today.</p>
        ) : (
          <ul className="space-y-2 max-h-[272px] overflow-y-auto pr-1 -mr-1" aria-label="Today's appointments">
            {list.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{a.patientName}</p>
                  <p className="text-sm font-medium text-foreground truncate">{a.service}</p>
                </div>
                <span className="text-xs text-foreground tabular-nums shrink-0">{formatTimeRange(a.time, a.endTime)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SuccessStats({ appointments, shown, before, today }: {
  appointments: Appointment[]; shown: Appointment[]; before: Appointment[] | null; today: string;
}) {
  const rate = successRate(shown, today);
  const was = before ? successRate(before, today) : null;
  const change = rate !== null && was !== null ? rate - was : null;
  const line = useMemo(() => monthlySuccess(appointments, today), [appointments, today]);
  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2">
        <CardTitleRow icon={TrendingUp} title="Success Stats" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-bold font-heading">{rate === null ? "—" : `${rate}%`}</span>
          {change !== null && (
            <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium",
              change >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
              {change >= 0 ? "+" : ""}{change} pts
            </span>
          )}
        </div>
        <ChartContainer config={LINE_CHART} className="aspect-auto h-[120px] w-full">
          <LineChart data={line} margin={{ left: -8, right: 8, top: 6 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(v) => `${v}% completed`} />} />
            <Line dataKey="rate" stroke="var(--color-rate)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ChartContainer>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-sm font-medium text-foreground">Success rate is {rate === null ? "—" : `${rate}%`}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The share of appointments that came due in this period and were completed. Cancelled, rejected and missed ones count against it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PatientTotalsCard({ totals, link, className }: { totals: PatientTotals; link: string; className?: string }) {
  const today = manilaTodayDateStr();
  const sum = useMemo(() => joinedSummary(totals.joined, today), [totals.joined, today]);
  const diff = sum.month - sum.previous;
  const accountShare = sum.all ? (sum.accounts / sum.all) * 100 : 0;
  return (
    <Card className={cn("shadow-card min-w-0", className)}>
      <CardContent className="p-5 sm:p-6 flex flex-col gap-4 h-full">
        <div>
          <p className="font-heading text-base font-semibold text-foreground">{totals.monthLabel}</p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-5xl font-bold font-heading text-muted-foreground/80 tabular-nums">{sum.month}</span>
            <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium",
              diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground")}>
              {diff > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : diff < 0 ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}
              {diff === 0 ? `Same as ${sum.previousLabel}` : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than ${sum.previousLabel}`}
            </span>
          </div>
          {/* The last six months, this one last. */}
          <ChartContainer config={TREND_CHART} className="aspect-auto h-[64px] w-full mt-2" aria-label="New patients, last 6 months">
            <BarChart data={sum.trend} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={4} fontSize={11} interval={0} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={22}>
                {sum.trend.map((t, i) => (
                  <Cell key={t.label} fill="var(--color-count)" fillOpacity={i === sum.trend.length - 1 ? 1 : 0.45} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
        <div>
          <p className="font-heading text-base font-semibold text-foreground">{totals.allLabel}</p>
          <p className="text-5xl font-bold font-heading text-muted-foreground/80 mt-1 tabular-nums">{sum.all}</p>
          {sum.all > 0 && (
            <>
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img"
                aria-label={`${sum.accounts} with an account, ${sum.guests} walk-in guests`}>
                <span style={{ width: `${accountShare}%`, background: ACCOUNT_COLOR }} />
                <span style={{ width: `${100 - accountShare}%`, background: GUEST_COLOR }} className="border-l-2 border-card" />
              </div>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground">
                <li className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: ACCOUNT_COLOR }} /> {sum.accounts} with an account
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: GUEST_COLOR }} /> {sum.guests} walk-in guest{sum.guests === 1 ? "" : "s"}
                </li>
              </ul>
            </>
          )}
        </div>
        <Button asChild variant="outline" className="mt-auto text-primary border-primary/40">
          <Link to={link}>View More</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

