import { useEffect, useMemo, useState } from "react";
import StatCard from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, CalendarDays, UserCog, Stethoscope, TrendingUp, Printer, Loader2 } from "lucide-react";
import { getStaff, type StaffMember } from "@/lib/api/staff";
import { getPatients } from "@/lib/api/patients";
import { getAppointments, type Appointment, type AptStatus } from "@/lib/api/appointments";
import { formatManilaDate } from "@/lib/formatDate";
import { usePrintDocument } from "@/hooks/usePrintDocument";

const STATUS_META: Record<AptStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warning" },
  confirmed: { label: "Confirmed", className: "bg-primary" },
  completed: { label: "Completed", className: "bg-success" },
  cancelled: { label: "Cancelled", className: "bg-destructive" },
  rejected: { label: "Rejected", className: "bg-destructive" },
  rescheduled: { label: "Rescheduled", className: "bg-warning" },
};

export default function SuperAdminDashboard() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [patientCount, setPatientCount] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getStaff(), getPatients(), getAppointments()])
      .then(([s, p, a]) => {
        setStaff(s);
        setPatientCount(p.length);
        setAppointments(a);
      })
      .finally(() => setLoading(false));
  }, []);

  const activeDentists = staff.filter(s => s.role === "dentist" && s.status === "active").length;

  const appointmentStatus = useMemo(() => {
    const counts = appointments.reduce<Partial<Record<AptStatus, number>>>((acc, a) => {
      acc[a.status] = (acc[a.status] ?? 0) + 1;
      return acc;
    }, {});
    return (Object.keys(counts) as AptStatus[])
      .filter(status => (counts[status] ?? 0) > 0)
      .map(status => ({ label: STATUS_META[status].label, value: counts[status] ?? 0, className: STATUS_META[status].className }));
  }, [appointments]);

  const maxStatus = Math.max(1, ...appointmentStatus.map(s => s.value));

  const print = usePrintDocument();
  // The figures behind the dashboard, as a document.
  const handlePrint = () =>
    print({
      title: "System Overview",
      tables: [
        {
          heading: "Summary",
          columns: ["Statistic", "Count"],
          rows: [
            ["Total Registered Patients", String(patientCount)],
            ["Total Appointments", String(appointments.length)],
            ["Total Staff", String(staff.length)],
            ["Active Dentists", String(activeDentists)],
          ],
        },
        {
          heading: "Staff Overview",
          columns: ["Name", "Role", "Status"],
          rows: staff.map(s => [s.name, s.role, s.status]),
          emptyText: "No staff accounts yet.",
        },
        {
          heading: "Appointment Status Summary",
          columns: ["Status", "Appointments"],
          rows: appointmentStatus.map(s => [s.label, String(s.value)]),
          emptyText: "No appointments yet.",
        },
      ],
    });

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Super Admin Report · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Super Admin Dashboard</h1>
          <p className="text-muted-foreground">System overview and analytics</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print Summary
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Total Registered Patients" value={patientCount} icon={Users} trend="All time" delay={0} />
            <StatCard title="Total Appointments" value={appointments.length} icon={CalendarDays} trend="All time" delay={0.1} />
            <StatCard title="Total Staff" value={staff.length} icon={UserCog} trend="Admins & dentists" delay={0.2} />
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
                {staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No staff accounts yet</p>
                ) : (
                  <div className="space-y-3">
                    {staff.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div>
                          <p className="font-medium text-sm text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{s.role}</p>
                        </div>
                        <Badge variant="outline" className={s.status === "active" ? "bg-success/10 text-success border-success/20 capitalize" : "bg-muted text-muted-foreground border-border capitalize"}>
                          {s.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="font-heading text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" /> Appointment Status Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appointmentStatus.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No appointments yet</p>
                ) : (
                  <>
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
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
