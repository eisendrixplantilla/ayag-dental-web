import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, CalendarDays, UserCog, Stethoscope, TrendingUp, Printer } from "lucide-react";
import { useActiveStaff } from "@/lib/staffStore";

const staffOverview = [
  { name: "Dr. Sarah Chen", role: "Dentist", status: "active" },
  { name: "Dr. Mike Johnson", role: "Dentist", status: "active" },
  { name: "Nurse Amy Lee", role: "Admin", status: "active" },
  { name: "Receptionist Jen", role: "Admin", status: "inactive" },
];

const appointmentStatus = [
  { label: "Pending", value: 12, className: "bg-warning" },
  { label: "Confirmed", value: 28, className: "bg-primary" },
  { label: "Completed", value: 96, className: "bg-success" },
  { label: "Cancelled", value: 7, className: "bg-destructive" },
];

export default function SuperAdminDashboard() {
  const active = useActiveStaff();
  const totalStaff = active.length || staffOverview.length;
  const activeDentists = staffOverview.filter(s => s.role === "Dentist" && s.status === "active").length;
  const totalAppointments = appointmentStatus.reduce((sum, s) => sum + s.value, 0);
  const maxStatus = Math.max(...appointmentStatus.map(s => s.value));

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Super Admin Report · Generated {new Date().toLocaleDateString()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Super Admin Dashboard</h1>
          <p className="text-muted-foreground">System overview and analytics</p>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print Graph
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Registered Patients" value={248} icon={Users} trend="All time" delay={0} />
        <StatCard title="Total Appointments" value={totalAppointments} icon={CalendarDays} trend="All time" delay={0.1} />
        <StatCard title="Total Staff" value={totalStaff} icon={UserCog} trend="Admins & dentists" delay={0.2} />
        <StatCard title="Active Dentists" value={activeDentists} icon={Stethoscope} trend="Currently active" delay={0.3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <UserCog className="w-5 h-5 text-primary" /> Staff Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {staffOverview.map((staff, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium text-sm text-foreground">{staff.name}</p>
                    <p className="text-xs text-muted-foreground">{staff.role}</p>
                  </div>
                  <Badge variant="outline" className={staff.status === "active" ? "bg-success/10 text-success border-success/20 capitalize" : "bg-muted text-muted-foreground border-border capitalize"}>
                    {staff.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" /> Appointment Status Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {appointmentStatus.map(s => (
                <div key={s.label} className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold font-heading text-foreground">{s.value}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {appointmentStatus.map(s => (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-foreground">{s.label}</p>
                    <p className="text-sm font-semibold text-foreground">{s.value}</p>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full">
                    <div className={`h-2 rounded-full ${s.className}`} style={{ width: `${(s.value / maxStatus) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
