import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  CalendarDays,
  CalendarPlus,
  CalendarCheck,
  CheckCircle2,
  Clock,
  UserPlus,
  Printer,
  Loader2,
} from "lucide-react";
import { getAppointments, byNewestBooked, type Appointment } from "@/lib/api/appointments";
import { getPatients } from "@/lib/api/patients";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { manilaTodayDateStr, manilaNowMinutes } from "@/lib/formatDate";

const statusColors: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
};

const today = manilaTodayDateStr();

export default function AdminDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patientCount, setPatientCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getAppointments(), getPatients()])
      .then(([a, p]) => {
        setAppointments(a);
        setPatientCount(p.length);
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const todays = appointments.filter(a => a.date === today);
    return {
      today: todays.length,
      pending: appointments.filter(a => a.status === "pending").length,
      confirmed: appointments.filter(a => a.status === "confirmed").length,
      completed: appointments.filter(a => a.status === "completed").length,
      walkIn: todays.filter(a => a.type === "walk-in").length,
    };
  }, [appointments]);

  const upcomingToday = useMemo(() => {
    const now = manilaNowMinutes();
    return appointments
      .filter(a => a.date === today && (a.status === "pending" || a.status === "confirmed"))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
      .map(a => ({ ...a, upcoming: toMinutes(a.time) >= now }));
  }, [appointments]);

  // "Recent" means recently booked, so a booking just taken is the first row.
  const recent = useMemo(() => [...appointments].sort(byNewestBooked).slice(0, 6), [appointments]);

  const print = usePrintDocument();
  // The dashboard's figures as a document: the counts, then the lists behind them.
  const handlePrint = () =>
    print({
      title: "Dashboard Summary",
      filters: [{ label: "As Of", value: today }],
      tables: [
        {
          heading: "Summary",
          columns: ["Statistic", "Count"],
          rows: [
            ["Today's Appointments", String(stats.today)],
            ["Pending Appointments", String(stats.pending)],
            ["Confirmed Appointments", String(stats.confirmed)],
            ["Completed Appointments", String(stats.completed)],
            ["Walk-in Appointments Today", String(stats.walkIn)],
            ["Total Registered Patients", String(patientCount)],
          ],
        },
        {
          heading: "Upcoming Appointments Today",
          columns: ["Time", "Patient", "Service", "Dentist", "Status"],
          rows: upcomingToday.filter(a => a.upcoming).map(a => [
            toLabel(toMinutes(a.time)),
            a.patientName,
            a.service,
            a.dentistName ?? "Unassigned",
            a.status,
          ]),
          emptyText: "No more appointments scheduled for today.",
        },
        {
          heading: "Recent Appointments",
          columns: ["Patient", "Service", "Dentist", "Schedule", "Type", "Status"],
          rows: recent.map(a => [
            a.patientName,
            a.service,
            a.dentistName ?? "—",
            `${format(parseISO(a.date), "MMM d, yyyy")} • ${toLabel(toMinutes(a.time))}`,
            a.type,
            a.status,
          ]),
          emptyText: "No appointments yet.",
        },
      ],
    });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.name}</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print Summary
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Today's Appointments" value={stats.today} icon={CalendarDays} trend="Scheduled today" delay={0} />
        <StatCard title="Pending Appointments" value={stats.pending} icon={Clock} trend="Awaiting approval" delay={0.05} />
        <StatCard title="Confirmed Appointments" value={stats.confirmed} icon={CalendarCheck} trend="Approved" delay={0.1} />
        <StatCard title="Completed Appointments" value={stats.completed} icon={CheckCircle2} trend="Finished visits" delay={0.15} />
        <StatCard title="Walk-in Appointments Today" value={stats.walkIn} icon={UserPlus} trend="Today" delay={0.2} />
        <StatCard title="Total Registered Patients" value={patientCount} icon={Users} trend="All time" delay={0.25} />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Upcoming Appointments Today
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingToday.filter(a => a.upcoming).length === 0 ? (
            <p className="text-sm text-muted-foreground">No more appointments scheduled for today.</p>
          ) : (
            <div className="space-y-3">
              {upcomingToday.filter(a => a.upcoming).map(apt => (
                <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-sm text-foreground">{apt.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {apt.service} • {toLabel(toMinutes(apt.time))} • {apt.dentistName ?? "Unassigned"}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-primary" /> Recent Appointments
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 font-medium">Patient</th>
                <th className="py-2 pr-4 font-medium">Service</th>
                <th className="py-2 pr-4 font-medium">Dentist</th>
                <th className="py-2 pr-4 font-medium">Schedule</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No appointments yet</td></tr>
              )}
              {recent.map(apt => (
                <tr key={apt.id} className="border-b border-border/50 last:border-0">
                  <td className="py-3 pr-4 font-medium text-foreground">{apt.patientName}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{apt.service}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{apt.dentistName ?? "—"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{format(parseISO(apt.date), "MMM d, yyyy")} • {toLabel(toMinutes(apt.time))}</td>
                  <td className="py-3 pr-4 text-muted-foreground capitalize">{apt.type}</td>
                  <td className="py-3">
                    <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
