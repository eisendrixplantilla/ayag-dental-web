import { useMemo } from "react";
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
} from "lucide-react";

const iso = (d: Date) => d.toISOString().split("T")[0];
const today = iso(new Date());
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

type Appointment = {
  id: number;
  patient: string;
  service: string;
  date: string;
  time: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "rejected";
  type: "online" | "walk-in";
};

// Sample appointments scoped to the logged-in dentist
const appointments: Appointment[] = [
  { id: 1, patient: "Maria Garcia", service: "Tooth Extraction", date: today, time: "9:00 AM", status: "completed", type: "online" },
  { id: 2, patient: "James Wilson", service: "Dental Cleaning", date: today, time: "10:30 AM", status: "confirmed", type: "online" },
  { id: 3, patient: "Emma Davis", service: "Root Canal", date: today, time: "11:00 AM", status: "confirmed", type: "walk-in" },
  { id: 4, patient: "Carlo Reyes", service: "Check-up", date: today, time: "1:00 PM", status: "pending", type: "walk-in" },
  { id: 5, patient: "Ana Santos", service: "Teeth Whitening", date: addDays(1), time: "2:30 PM", status: "confirmed", type: "online" },
  { id: 6, patient: "Juan Dela Cruz", service: "Filling", date: addDays(2), time: "10:00 AM", status: "confirmed", type: "online" },
  { id: 7, patient: "Maria Santos", service: "Orthodontics (Braces)", date: addDays(3), time: "2:00 PM", status: "pending", type: "online" },
  { id: 8, patient: "Pedro Reyes", service: "EXO (Bunot)", date: addDays(-1), time: "9:00 AM", status: "completed", type: "walk-in" },
  { id: 9, patient: "Lisa Anderson", service: "Dental Cleaning", date: addDays(-2), time: "4:00 PM", status: "completed", type: "online" },
];

const statusColors: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const toMinutes = (t: string) => {
  const [time, mer] = t.split(" ");
  let [h, m] = time.split(":").map(Number);
  if (mer === "PM" && h !== 12) h += 12;
  if (mer === "AM" && h === 12) h = 0;
  return h * 60 + m;
};

export default function DentistDashboard() {
  const { user } = useAuth();

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
  }, []);

  const todaysSchedule = useMemo(() => {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return appointments
      .filter(a => a.date === today)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
      .map(a => ({ ...a, upcoming: toMinutes(a.time) >= now }));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your day, {user?.name || "Doctor"}</p>
      </div>

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
                    <p className="font-medium text-sm text-foreground">{apt.patient}</p>
                    <p className="text-xs text-muted-foreground">
                      {apt.service} • {apt.time} • {apt.type === "walk-in" ? "Walk-in" : "Online"}
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
    </div>
  );
}
