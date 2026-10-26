import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { CalendarDays, Clock, ListOrdered, Loader2, Printer, UserPlus, Users } from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getPatients } from "@/lib/api/patients";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { manilaDateOf, manilaNowMinutes, manilaTodayDateStr } from "@/lib/formatDate";
import { PeriodPicker } from "@/components/ReportOverview";
import { DashboardCharts } from "@/components/ReportCharts";
import TodayList from "@/components/TodayList";
import { STATUSES, STATUS_LABEL, countByStatus, datesInPeriod, inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";

/** The front desk's summary: the period's numbers and graphs, and who is still to come today. */
export default function AdminDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  /** Each patient's registration date, in Manila ("yyyy-MM-dd"). */
  const [registered, setRegistered] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));

  useEffect(() => {
    setLoading(true);
    Promise.all([getAppointments(), getPatients()])
      .then(([a, p]) => {
        setAppointments(a);
        setRegistered(p.flatMap((x) => (x.createdAt ? [manilaDateOf(x.createdAt)] : [])));
      })
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => inPeriod(appointments, period), [appointments, period]);
  const newPatients = useMemo(() => datesInPeriod(registered, period).length, [registered, period]);
  const pending = shown.filter((a) => a.status === "pending").length;
  const walkIns = shown.filter((a) => a.type === "walk-in").length;
  const label = periodLabel(period);

  // Today's bookings still to come, in time order.
  const upcomingToday = useMemo(() => {
    const today = manilaTodayDateStr();
    const now = manilaNowMinutes();
    return appointments
      .filter((a) => a.date === today && ["pending", "confirmed", "rescheduled"].includes(a.status) && toMinutes(a.time) >= now)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  }, [appointments]);

  const print = usePrintDocument();
  // The dashboard's figures, for the period on show, and today's queue, as a document.
  const handlePrint = () => {
    const counts = countByStatus(shown);
    print({
      title: "Dashboard Summary",
      filters: [{ label: "Period", value: label }],
      tables: [
        {
          heading: "Summary",
          showCount: false,
          columns: ["Statistic", "Count"],
          rows: [
            ["Appointments", String(shown.length)],
            ["Pending Requests", String(pending)],
            ["Walk-ins", String(walkIns)],
            ["New Patients", String(newPatients)],
            ["Total Registered Patients", String(registered.length)],
          ],
        },
        {
          heading: "Appointments by Status",
          showCount: false,
          columns: ["Status", "Appointments"],
          rows: STATUSES.map((s) => [STATUS_LABEL[s], String(counts[s])]),
        },
        {
          heading: "Still to Come Today",
          columns: ["Time", "Patient", "Service", "Dentist", "Status"],
          rows: upcomingToday.map((a) => [toLabel(toMinutes(a.time)), a.patientName, a.service, a.dentistName ?? "Unassigned", STATUS_LABEL[a.status]]),
          emptyText: "No more appointments scheduled for today.",
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.name}</p>
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
            <StatCard title="Appointments" value={shown.length} icon={CalendarDays} note={label} delay={0} />
            <StatCard title="Pending Requests" value={pending} icon={Clock} note="Awaiting approval" delay={0.05} />
            <StatCard title="Walk-ins" value={walkIns} icon={UserPlus} note={label} delay={0.1} />
            <StatCard title="New Patients" value={newPatients} icon={Users} note={`${registered.length} in total`} delay={0.15} />
          </div>

          <DashboardCharts appointments={shown} period={period} />

          <TodayList
            title="Still to Come Today"
            icon={ListOrdered}
            emptyText="No more appointments scheduled for today."
            link={{ to: "/admin/queue", label: "Open queue" }}
            items={upcomingToday.map((a) => ({
              id: a.id,
              when: toLabel(toMinutes(a.time)),
              title: a.patientName,
              detail: `${a.service} · ${a.dentistName ?? "Unassigned"}`,
              status: a.status,
            }))}
          />
        </>
      )}
    </div>
  );
}
