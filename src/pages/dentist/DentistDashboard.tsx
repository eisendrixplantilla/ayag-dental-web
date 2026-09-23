import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Users,
  Clock,
  Loader2,
} from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { toMinutes, toLabel, formatTimeRange } from "@/lib/dentistSchedules";
import { manilaTodayDateStr, manilaNowMinutes } from "@/lib/formatDate";

const today = manilaTodayDateStr();

const statusColors: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function DentistDashboard() {
  const { user } = useAuth();
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

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

  const stats = useMemo(() => {
    const todays = appointments.filter(a => a.date === today);
    const upcoming = appointments.filter(a => (a.status === "confirmed" || a.status === "pending") && a.date >= today);
    const completed = appointments.filter(a => a.status === "completed");
    return {
      today: todays.length,
      upcoming: upcoming.length,
      completed: completed.length,
      totalPatientsToday: todays.filter(a => a.status !== "cancelled" && a.status !== "rejected").length,
    };
  }, [appointments]);

  const todaysSchedule = useMemo(() => {
    const now = manilaNowMinutes();
    return appointments
      .filter(a => a.date === today)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
      .map(a => ({ ...a, upcoming: toMinutes(a.time) >= now }));
  }, [appointments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your day, {user?.name || "Doctor"}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Today's Appointments" value={stats.today} icon={CalendarDays} trend="Scheduled today" delay={0} />
        <StatCard title="Upcoming Appointments" value={stats.upcoming} icon={CalendarClock} trend="Pending + Confirmed" delay={0.05} />
        <StatCard title="Completed Consultations" value={stats.completed} icon={CheckCircle2} trend="Finished visits" delay={0.1} />
        <StatCard title="Total Patients Today" value={stats.totalPatientsToday} icon={Users} trend="Seen / to be seen" delay={0.15} />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Today's Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaysSchedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments scheduled for today.</p>
          ) : (
            <div className="space-y-3">
              {todaysSchedule.map(apt => (
                <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-sm text-foreground">{apt.patientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {apt.service} • {formatTimeRange(apt.time, apt.endTime)} • {apt.type === "walk-in" ? "Walk-in" : "Online"}
                    </p>
                  </div>
                  <Badge variant="outline" className={statusColors[apt.status]}>
                    {apt.status}
                    {apt.upcoming && apt.status !== "completed" && (
                      <span className="ml-1.5">• Upcoming</span>
                    )}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
}
