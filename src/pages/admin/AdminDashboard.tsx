import { useMemo } from "react";
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
  dentist: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "rejected";
  type: "online" | "walk-in";
};

const appointments: Appointment[] = [
  { id: 1, patient: "Maria Garcia", service: "Tooth Extraction", date: today, time: "9:00 AM", dentist: "Dr. Sarah Chen", status: "completed", type: "online" },
  { id: 2, patient: "James Wilson", service: "Dental Cleaning", date: today, time: "10:30 AM", dentist: "Dr. Michael Lee", status: "confirmed", type: "online" },
  { id: 3, patient: "Emma Davis", service: "Root Canal", date: today, time: "11:00 AM", dentist: "Dr. Sarah Chen", status: "confirmed", type: "online" },
  { id: 4, patient: "Carlo Reyes", service: "Tooth Extraction", date: today, time: "1:00 PM", dentist: "Dr. Sarah Chen", status: "confirmed", type: "walk-in" },
  { id: 5, patient: "Ana Santos", service: "Check-up", date: today, time: "2:30 PM", dentist: "Dr. Michael Lee", status: "pending", type: "walk-in" },
  { id: 6, patient: "Juan Dela Cruz", service: "Teeth Whitening", date: addDays(1), time: "10:00 AM", dentist: "Dr. Sarah Chen", status: "pending", type: "online" },
  { id: 7, patient: "Maria Santos", service: "Root Canal", date: addDays(2), time: "2:00 PM", dentist: "Dr. Michael Lee", status: "pending", type: "online" },
  { id: 8, patient: "Pedro Reyes", service: "Orthodontics (Braces)", date: addDays(3), time: "9:00 AM", dentist: "Dr. Sarah Chen", status: "confirmed", type: "online" },
  { id: 9, patient: "Ana Garcia", service: "EXO (Bunot)", date: addDays(-1), time: "3:30 PM", dentist: "Dr. Michael Lee", status: "completed", type: "walk-in" },
  { id: 10, patient: "Lisa Anderson", service: "Filling", date: addDays(-2), time: "4:00 PM", dentist: "Dr. Sarah Chen", status: "rejected", type: "online" },
];

const totalRegisteredPatients = 248;

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

export default function AdminDashboard() {
  const stats = useMemo(() => {
    const todays = appointments.filter(a => a.date === today);
    return {
      today: todays.length,
      pending: appointments.filter(a => a.status === "pending").length,
      confirmed: appointments.filter(a => a.status === "confirmed").length,
      completed: appointments.filter(a => a.status === "completed").length,
      walkIn: todays.filter(a => a.type === "walk-in").length,
    };
  }, []);

  const upcomingToday = useMemo(() => {
    const now = new Date().getHours() * 60 + new Date().getMinutes();
    return appointments
      .filter(a => a.date === today && (a.status === "pending" || a.status === "confirmed"))
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
      .map(a => ({ ...a, upcoming: toMinutes(a.time) >= now }));
  }, []);

  const recent = useMemo(
    () => [...appointments].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6),
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, Dr. Sarah Chen</p>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print Graph
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Today's Appointments" value={stats.today} icon={CalendarDays} trend="Scheduled today" delay={0} />
        <StatCard title="Pending Appointments" value={stats.pending} icon={Clock} trend="Awaiting approval" delay={0.05} />
        <StatCard title="Confirmed Appointments" value={stats.confirmed} icon={CalendarCheck} trend="Approved" delay={0.1} />
        <StatCard title="Completed Appointments" value={stats.completed} icon={CheckCircle2} trend="Finished visits" delay={0.15} />
        <StatCard title="Walk-in Appointments Today" value={stats.walkIn} icon={UserPlus} trend="Today" delay={0.2} />
        <StatCard title="Total Registered Patients" value={totalRegisteredPatients} icon={Users} trend="All time" delay={0.25} />
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
                    <p className="font-medium text-sm text-foreground">{apt.patient}</p>
                    <p className="text-xs text-muted-foreground">
                      {apt.service} • {apt.time} • {apt.dentist}
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
          <table className="w-full text-sm">
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
              {recent.map(apt => (
                <tr key={apt.id} className="border-b border-border/50 last:border-0">
                  <td className="py-3 pr-4 font-medium text-foreground">{apt.patient}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{apt.service}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{apt.dentist}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{apt.date} • {apt.time}</td>
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
    </div>
  );
}
