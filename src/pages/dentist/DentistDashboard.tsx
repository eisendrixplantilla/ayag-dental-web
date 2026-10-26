import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import StatCard from "@/components/StatCard";
import { CalendarClock, CalendarDays, CheckCircle2, Clock, Loader2, Users } from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { toMinutes, toLabel } from "@/lib/dentistSchedules";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { PeriodPicker } from "@/components/ReportOverview";
import { DashboardCharts } from "@/components/ReportCharts";
import TodayList from "@/components/TodayList";
import { inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";

/** A dentist's summary of their own appointments: the period's numbers and graphs, and today. */
export default function DentistDashboard() {
  const { user } = useAuth();
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));

  useEffect(() => {
    setLoading(true);
    getAppointments()
      .then(setAllAppointments)
      .finally(() => setLoading(false));
  }, []);

  const appointments = useMemo(
    () => allAppointments.filter(a => !user?.name || a.dentistName === user.name),
    [allAppointments, user],
  );

  const today = manilaTodayDateStr();
  const shown = useMemo(() => inPeriod(appointments, period), [appointments, period]);
  const completed = shown.filter((a) => a.status === "completed").length;
  const upcoming = appointments.filter((a) => ["pending", "confirmed", "rescheduled"].includes(a.status) && a.date >= today).length;
  const label = periodLabel(period);

  const todaysSchedule = useMemo(
    () => appointments
      .filter((a) => a.date === today && a.status !== "cancelled" && a.status !== "rejected")
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time)),
    [appointments, today],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your day, {user?.name || "Doctor"}</p>
      </div>

      <PeriodPicker period={period} onChange={setPeriod} />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard title="My Appointments" value={shown.length} icon={CalendarDays} note={label} delay={0} />
            <StatCard title="Completed" value={completed} icon={CheckCircle2} note={label} delay={0.05} />
            <StatCard title="Upcoming" value={upcoming} icon={CalendarClock} note="From today on" delay={0.1} />
            <StatCard title="Patients Today" value={todaysSchedule.length} icon={Users} note="Seen or to be seen" delay={0.15} />
          </div>

          <DashboardCharts appointments={shown} period={period} />

          <TodayList
            title="Today's Schedule"
            icon={Clock}
            emptyText="No appointments scheduled for today."
            link={{ to: "/dentist/appointments", label: "All appointments" }}
            items={todaysSchedule.map((a) => ({
              id: a.id,
              when: toLabel(toMinutes(a.time)),
              title: a.patientName,
              detail: `${a.service} · ${a.type === "walk-in" ? "Walk-in" : "Online"}`,
              status: a.status,
            }))}
          />
        </>
      )}
    </div>
  );
}
