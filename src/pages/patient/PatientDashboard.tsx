import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, History, Bell, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";

const today = format(new Date(), "yyyy-MM-dd");

export default function PatientDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAppointments()
      .then(setAppointments)
      .finally(() => setLoading(false));
  }, []);

  const { upcoming, nextConfirmed, totalVisits, reminders } = useMemo(() => {
    const upcoming = appointments
      .filter(a => (a.status === "pending" || a.status === "confirmed") && a.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    const nextConfirmed = upcoming.find((a) => a.status === "confirmed") ?? null;
    const totalVisits = appointments.filter((a) => a.status === "completed").length;

    const reminders: string[] = [];
    if (nextConfirmed) {
      const dayDiff = Math.round(
        (parseISO(nextConfirmed.date).getTime() - parseISO(today).getTime()) / (1000 * 60 * 60 * 24)
      );
      const whenLabel =
        dayDiff === 0 ? "today" : dayDiff === 1 ? "tomorrow" : `on ${format(parseISO(nextConfirmed.date), "MMM d, yyyy")}`;
      reminders.push(
        `Your ${nextConfirmed.service.toLowerCase()} appointment is ${whenLabel} at ${toLabel(toMinutes(nextConfirmed.time))}.`
      );
      reminders.push("Please arrive 10 minutes early and bring a valid ID.");
    } else {
      reminders.push("You have no confirmed appointments. Book a visit to keep your smile healthy.");
      reminders.push("Regular check-ups every 6 months help prevent cavities and gum disease.");
      reminders.push("Brush twice daily and floss to maintain good oral hygiene.");
    }

    return { upcoming, nextConfirmed, totalVisits, reminders };
  }, [appointments]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.name}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Upcoming Appointments" value={upcoming.length} icon={CalendarDays} delay={0} />
        <StatCard title="Total Visits" value={totalVisits} icon={History} delay={0.1} />
        <StatCard
          title="Next Appointment"
          value={nextConfirmed ? format(parseISO(nextConfirmed.date), "MMM d") : "None"}
          icon={CalendarDays}
          trend={nextConfirmed ? nextConfirmed.service : "No confirmed appointment"}
          delay={0.2}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Upcoming Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcoming.length === 0 && (
                <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
              )}
              {upcoming.map((apt) => (
                <div key={apt.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-foreground">{apt.service}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(apt.date), "MMM d, yyyy")} at {toLabel(toMinutes(apt.time))}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      apt.status === "confirmed"
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-warning/10 text-warning border-warning/20"
                    }
                  >
                    {apt.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" /> Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {reminders.map((r, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <p className="text-sm text-foreground">{r}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
