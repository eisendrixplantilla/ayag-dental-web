import { CalendarDays, PieChart, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/api/appointments";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { inPeriod, periodBounds, periodLabel, type Period } from "@/lib/reportPeriod";
import ReportCharts, { OverTimeChart, StatusDonut } from "@/components/ReportCharts";
import { DatePicker, MonthPicker } from "@/components/DatePicker";
import Segmented from "@/components/Segmented";

/** One number in the strip under the period: what it counts, and over what. */
export interface ReportStat {
  label: string;
  value: number;
  icon: LucideIcon;
  /** "All time", or the period's label. */
  note: string;
}

/**
 * The Overview tab of Reports & Analytics, for the superadmin and the front desk alike:
 * the period, a slim strip of numbers (`stats`, plus the period's appointments), the
 * appointments by status and over time, and by dentist and service.
 */
export default function ReportOverview({ appointments, period, onPeriodChange, stats }: {
  appointments: Appointment[];
  period: Period;
  onPeriodChange: (p: Period) => void;
  /** Shown around the period's appointment count: the first before it, the rest after. */
  stats: ReportStat[];
}) {
  const shown = inPeriod(appointments, period);
  const total = shown.length;
  const strip = [
    ...stats.slice(0, 1),
    { label: "Appointments", value: total, icon: CalendarDays, note: periodLabel(period) },
    ...stats.slice(1),
  ];

  return (
    <>
      {/* The period only steers the overview; a generated report has its own filters. */}
      <PeriodPicker period={period} onChange={onPeriodChange} />
      <Card className="shadow-card">
        <CardContent className={cn("grid divide-x p-0", strip.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
          {strip.map((s) => (
            <div key={s.label} className="flex items-center gap-3 px-3 py-3 sm:px-5 min-w-0">
              <div className="hidden sm:flex w-9 h-9 shrink-0 rounded-lg bg-secondary items-center justify-center">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                <p className="text-xl font-bold font-heading leading-tight">{s.value}</p>
                <p className="text-[11px] text-muted-foreground truncate">{s.note}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" /> Appointments
          </CardTitle>
          <p className="text-sm text-muted-foreground">{periodLabel(period)} · {total} appointment{total === 1 ? "" : "s"}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 items-center">
          <StatusDonut appointments={shown} />
          <div className="min-w-0">
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">Over Time</h4>
            <OverTimeChart appointments={shown} period={period} />
          </div>
        </CardContent>
      </Card>

      <ReportCharts appointments={shown} />
    </>
  );
}

/** Month, a range of dates, or all time: what the strip and the graphs count over. */
export function PeriodPicker({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const thisMonth = manilaTodayDateStr().slice(0, 7);
  const bounds = periodBounds(period);
  const kinds: { kind: Period["kind"]; label: string }[] = [
    { kind: "month", label: "Month" },
    { kind: "range", label: "Date range" },
    { kind: "all", label: "All time" },
  ];
  const switchTo = (kind: Period["kind"]) => {
    if (kind === period.kind) return;
    if (kind === "all") onChange({ kind: "all" });
    // A range starts as the month on show, so switching doesn't jump somewhere else.
    else if (kind === "range") onChange({ kind: "range", from: bounds?.from ?? `${thisMonth}-01`, to: bounds?.to ?? manilaTodayDateStr() });
    else onChange({ kind: "month", month: bounds?.from.slice(0, 7) ?? thisMonth });
  };

  // One compact line; the labels are for screen readers. The pickers match the period
  // buttons' height and background.
  const field = "h-9 bg-card";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented label="Period" value={period.kind} onChange={switchTo} options={kinds.map((k) => ({ value: k.kind, label: k.label }))} />
      {period.kind === "month" && (
        <>
          <Label htmlFor="report-month" className="sr-only">Month</Label>
          <MonthPicker id="report-month" className={cn(field, "w-44")} value={period.month} required
            onChange={(v) => v && onChange({ kind: "month", month: v })} />
        </>
      )}
      {period.kind === "range" && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor="report-from" className="sr-only">From</Label>
          <DatePicker id="report-from" className={cn(field, "w-44")} value={period.from} max={period.to} required
            onChange={(v) => v && onChange({ ...period, from: v })} />
          <span className="text-muted-foreground text-sm" aria-hidden>–</span>
          <Label htmlFor="report-to" className="sr-only">To</Label>
          <DatePicker id="report-to" className={cn(field, "w-44")} value={period.to} min={period.from} required
            onChange={(v) => v && onChange({ ...period, to: v })} />
        </div>
      )}
    </div>
  );
}
