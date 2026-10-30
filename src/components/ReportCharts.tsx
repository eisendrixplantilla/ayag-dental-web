import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { type LucideIcon, Stethoscope, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/api/appointments";
import {
  STATUSES, STATUS_LABEL, byDentist, byService, countByStatus, overTime, type Period,
} from "@/lib/reportPeriod";

/** One colour per status, the same in every chart (and close to the badges'). */
const STATUS_CHART: ChartConfig = {
  pending: { label: STATUS_LABEL.pending, color: "hsl(38 92% 50%)" },
  confirmed: { label: STATUS_LABEL.confirmed, color: "hsl(174 72% 33%)" },
  rescheduled: { label: STATUS_LABEL.rescheduled, color: "hsl(239 84% 67%)" },
  completed: { label: STATUS_LABEL.completed, color: "hsl(142 71% 36%)" },
  cancelled: { label: STATUS_LABEL.cancelled, color: "hsl(0 72% 51%)" },
  rejected: { label: STATUS_LABEL.rejected, color: "hsl(343 70% 34%)" },
};
const COUNT_CHART: ChartConfig = { count: { label: "Appointments", color: "hsl(174 72% 33%)" } };

export function ChartCard({ title, icon: Icon, note, className, children }: {
  title: string;
  icon: LucideIcon;
  /** A line under the title: what the chart counts over. */
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("shadow-card print:hidden min-w-0", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /> {title}</CardTitle>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Empty = () => <p className="py-16 text-center text-sm text-muted-foreground">No appointments in this period.</p>;

/** Horizontal bars of a count per name: who, or what, the period's appointments were for. */
function RankBars({ data }: { data: { name: string; count: number }[] }) {
  if (data.length === 0) return <Empty />;
  return (
    <ChartContainer config={COUNT_CHART} className="aspect-auto w-full" style={{ height: Math.max(120, data.length * 36 + 40) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 24 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false}
          tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

/** The period's appointments by status: a donut with the total in the middle, and every
 * status listed beside it with its count and share, so the numbers are read off the list. */
export function StatusDonut({ appointments }: { appointments: Appointment[] }) {
  const counts = useMemo(() => countByStatus(appointments), [appointments]);
  const total = appointments.length;
  const slices = STATUSES.filter((s) => counts[s] > 0).map((s) => ({ status: s as string, count: counts[s], fill: `var(--color-${s})` }));
  // An empty period still shows a (grey) ring, with 0 in the middle.
  const ring = total ? slices : [{ status: "none", count: 1, fill: "hsl(var(--muted))" }];

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <ChartContainer config={STATUS_CHART} className="aspect-square w-[180px] shrink-0">
        <PieChart>
          {total > 0 && <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="status" hideLabel />} />}
          <Pie data={ring} dataKey="count" nameKey="status" innerRadius={58} outerRadius={85} strokeWidth={2}>
            {ring.map((s) => <Cell key={s.status} fill={s.fill} />)}
            <Label
              content={({ viewBox }) => {
                if (!viewBox || !("cx" in viewBox)) return null;
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">{total}</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">appointments</tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="w-full max-w-xs space-y-1.5 text-sm" aria-label="Appointments by status">
        {STATUSES.map((s) => (
          <li key={s} className={cn("flex items-center gap-2", counts[s] === 0 && "text-muted-foreground")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: STATUS_CHART[s].color }} />
            <span className="flex-1">{STATUS_LABEL[s]}</span>
            <span className="font-semibold tabular-nums">{counts[s]}</span>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
              {total ? Math.round((counts[s] / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** When the period's appointments fall, a bar per day (or month) split by status. */
export function OverTimeChart({ appointments, period }: { appointments: Appointment[]; period: Period }) {
  const timeline = useMemo(() => overTime(appointments, period), [appointments, period]);
  if (appointments.length === 0) return <Empty />;
  return (
    <ChartContainer config={STATUS_CHART} className="aspect-auto h-[240px] w-full">
      <BarChart data={timeline} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} className="flex-wrap gap-x-3 gap-y-1" />
        {STATUSES.map((s, i) => (
          <Bar key={s} dataKey={s} stackId="status" fill={`var(--color-${s})`}
            radius={i === STATUSES.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

/** Who and what the period's appointments were for. */
export default function ReportCharts({ appointments }: { appointments: Appointment[] }) {
  const dentists = useMemo(() => byDentist(appointments), [appointments]);
  const services = useMemo(() => byService(appointments), [appointments]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="By Dentist" icon={UserRound}>
        <RankBars data={dentists} />
      </ChartCard>

      <ChartCard title="Top Services" icon={Stethoscope}>
        <RankBars data={services} />
      </ChartCard>
    </div>
  );
}
