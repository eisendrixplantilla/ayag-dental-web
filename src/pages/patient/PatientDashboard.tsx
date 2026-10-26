import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TodayList from "@/components/TodayList";
import { CalendarDays, History, Bell, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { toLabel, toMinutes, formatTimeRange } from "@/lib/dentistSchedules";
import { manilaTodayDateStr } from "@/lib/formatDate";

const today = manilaTodayDateStr();

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
      .filter(a => (a.status === "pending" || a.status === "confirmed" || a.status === "rescheduled") && a.date >= today)
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard title="Upcoming Appointments" value={upcoming.length} icon={CalendarDays} note="Pending or confirmed" delay={0} />
        <StatCard title="Total Visits" value={totalVisits} icon={History} note="Completed visits" delay={0.1} />
        <StatCard
          title="Next Appointment"
          value={nextConfirmed ? format(parseISO(nextConfirmed.date), "MMM d") : "None"}
          icon={CalendarDays}
          note={nextConfirmed ? `${nextConfirmed.service} · ${toLabel(toMinutes(nextConfirmed.time))}` : "No confirmed appointment"}
          delay={0.2}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TodayList
          title="Next Visits"
          icon={CalendarDays}
          emptyText="No upcoming appointments."
          link={{ to: "/patient/appointments", label: "My appointments" }}
          items={upcoming.map((a) => ({
            id: a.id,
            when: format(parseISO(a.date), "MMM d"),
            title: a.service,
            detail: formatTimeRange(a.time, a.endTime),
            status: a.status,
          }))}
        />

        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Reminders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5">
              {reminders.map((r, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <p className="text-sm text-foreground">{r}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
