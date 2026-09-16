import { useMemo } from "react";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, History, Bell } from "lucide-react";

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

interface Appointment {
  service: string;
  date: Date;
  time: string;
  status: AppointmentStatus;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const addDays = (days: number) => {
  const d = startOfToday();
  d.setDate(d.getDate() + days);
  return d;
};

// Mock patient appointment data
const allAppointments: Appointment[] = [
  { service: "Dental Cleaning", date: addDays(1), time: "10:00 AM", status: "confirmed" },
  { service: "Check-up", date: addDays(16), time: "2:00 PM", status: "pending" },
  { service: "Filling", date: addDays(-30), time: "9:00 AM", status: "completed" },
  { service: "Tooth Extraction", date: addDays(-60), time: "11:00 AM", status: "cancelled" },
  { service: "Braces Consultation", date: addDays(5), time: "3:00 PM", status: "rejected" },
];

const formatDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const formatShortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function PatientDashboard() {
  const { upcoming, nextConfirmed, totalVisits, reminders } = useMemo(() => {
    const today = startOfToday();

    const upcoming = allAppointments
      .filter(
        (a) =>
          (a.status === "pending" || a.status === "confirmed") && a.date.getTime() >= today.getTime()
      )
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const nextConfirmed = upcoming.find((a) => a.status === "confirmed") ?? null;
    const totalVisits = allAppointments.filter((a) => a.status === "completed").length;

    const reminders: string[] = [];
    if (nextConfirmed) {
      const dayDiff = Math.round(
        (nextConfirmed.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const whenLabel =
        dayDiff === 0
          ? "today"
          : dayDiff === 1
          ? "tomorrow"
          : `on ${formatDate(nextConfirmed.date)}`;
      reminders.push(
        `Your ${nextConfirmed.service.toLowerCase()} appointment is ${whenLabel} at ${nextConfirmed.time}.`
      );
      reminders.push("Please arrive 10 minutes early and bring a valid ID.");
    } else {
      reminders.push("You have no confirmed appointments. Book a visit to keep your smile healthy.");
      reminders.push("Regular check-ups every 6 months help prevent cavities and gum disease.");
      reminders.push("Brush twice daily and floss to maintain good oral hygiene.");
    }

    return { upcoming, nextConfirmed, totalVisits, reminders };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, John Smith</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Upcoming Appointments" value={upcoming.length} icon={CalendarDays} delay={0} />
        <StatCard title="Total Visits" value={totalVisits} icon={History} delay={0.1} />
        <StatCard
          title="Next Appointment"
          value={nextConfirmed ? formatShortDate(nextConfirmed.date) : "None"}
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
              {upcoming.map((apt, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-foreground">{apt.service}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(apt.date)} at {apt.time}
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
    </div>
  );
}
