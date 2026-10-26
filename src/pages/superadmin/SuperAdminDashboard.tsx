import { useEffect, useMemo, useState } from "react";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, Loader2, Printer, Stethoscope, UserPlus } from "lucide-react";
import { getStaff, type StaffMember } from "@/lib/api/staff";
import { getPatients } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { manilaDateOf, manilaTodayDateStr } from "@/lib/formatDate";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { PeriodPicker } from "@/components/ReportOverview";
import { DashboardCharts } from "@/components/ReportCharts";
import { STATUSES, STATUS_LABEL, countByStatus, datesInPeriod, inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";

/** A summary at a glance for the period: four numbers and two graphs. The detail lives in
 * Reports & Analytics, Staff and Appointments. */
export default function SuperAdminDashboard() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  /** Each patient's registration date, in Manila ("yyyy-MM-dd"). */
  const [registered, setRegistered] = useState<string[]>([]);
  const [patientCount, setPatientCount] = useState(0);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));

  useEffect(() => {
    setLoading(true);
    Promise.all([getStaff(), getPatients(), getAppointments()])
      .then(([s, p, a]) => {
        setStaff(s);
        setPatientCount(p.length);
        setRegistered(p.flatMap((x) => (x.createdAt ? [manilaDateOf(x.createdAt)] : [])));
        setAppointments(a);
      })
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => inPeriod(appointments, period), [appointments, period]);
  const newPatients = useMemo(() => datesInPeriod(registered, period).length, [registered, period]);
  const pending = shown.filter((a) => a.status === "pending").length;
  const activeDentists = staff.filter((s) => s.role === "dentist" && s.status === "active").length;
  const totalDentists = staff.filter((s) => s.role === "dentist").length;
  const label = periodLabel(period);

  const print = usePrintDocument();
  // The figures behind the dashboard, for the period on show, as a document.
  const handlePrint = () => {
    const counts = countByStatus(shown);
    print({
      title: "System Overview",
      filters: [{ label: "Period", value: label }],
      tables: [
        {
          heading: "Summary",
          showCount: false,
          columns: ["Statistic", "Count"],
          rows: [
            ["New Patients", String(newPatients)],
            ["Appointments", String(shown.length)],
            ["Pending Requests", String(pending)],
            ["Total Registered Patients", String(patientCount)],
            ["Active Dentists", String(activeDentists)],
          ],
        },
        {
          heading: "Appointments by Status",
          showCount: false,
          columns: ["Status", "Appointments"],
          rows: STATUSES.map((s) => [STATUS_LABEL[s], String(counts[s])]),
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Super Admin Dashboard</h1>
          <p className="text-muted-foreground">System overview and analytics</p>
        </div>
        <Button onClick={handlePrint} disabled={loading} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print Summary
        </Button>
      </div>

      <PeriodPicker period={period} onChange={setPeriod} />

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard title="New Patients" value={newPatients} icon={UserPlus} note={`${patientCount} in total`} delay={0} />
            <StatCard title="Appointments" value={shown.length} icon={CalendarDays} note={label} delay={0.05} />
            <StatCard title="Pending Requests" value={pending} icon={Clock} note="Awaiting approval" delay={0.1} />
            <StatCard title="Active Dentists" value={activeDentists} icon={Stethoscope} note={`of ${totalDentists} dentist${totalDentists === 1 ? "" : "s"}`} delay={0.15} />
          </div>

          <DashboardCharts appointments={shown} period={period} />
        </>
      )}
    </div>
  );
}
