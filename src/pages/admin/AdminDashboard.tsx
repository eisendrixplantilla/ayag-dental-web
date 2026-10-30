import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getDentistDirectory, getDentistSchedule, type DentistDirectoryEntry, type DentistScheduleData } from "@/lib/api/staff";
import { manilaDateOf, manilaTodayDateStr } from "@/lib/formatDate";
import { PeriodPicker } from "@/components/ReportOverview";
import ClinicDashboard, { ApprovalRequests, TopTreatments } from "@/components/ClinicDashboard";
import { CheckInList, DentistsToday } from "@/components/TodayCards";
import { dashboardPrintTables, firstVisits } from "@/lib/dashboardStats";
import { inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";

/** The front desk's dashboard: the period's numbers and graphs, the next patient, the
 * requests waiting for approval, and today's appointments. */
export default function AdminDashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [dentists, setDentists] = useState<DentistDirectoryEntry[]>([]);
  const [schedules, setSchedules] = useState<Record<string, DentistScheduleData>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));

  const load = useCallback(() => {
    return Promise.all([getAppointments(), getPatients()]).then(([a, p]) => {
      setAppointments(a);
      setPatients(p);
    });
  }, []);
  // Each dentist's hours and days off, for who can still take a walk-in today. Read once;
  // the card lists the dentists without them meanwhile (or if they can't be read).
  useEffect(() => {
    let live = true;
    getDentistDirectory()
      .then(async (list) => {
        if (!live || !Array.isArray(list)) return;
        setDentists(list);
        const pairs = await Promise.all(list.map((d) => getDentistSchedule(d.id).then((sch) => [d.id, sch] as const).catch(() => null)));
        if (live) setSchedules(Object.fromEntries(pairs.filter((x): x is readonly [string, DentistScheduleData] => !!x)));
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const shown = useMemo(() => inPeriod(appointments, period), [appointments, period]);
  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Dashboard Summary",
      showTotal: false,
      filters: [{ label: "Period", value: periodLabel(period) }],
      tables: dashboardPrintTables(appointments, period),
    });

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
        <ClinicDashboard
          appointments={appointments}
          period={period}
          middle={[
            <TopTreatments key="top" appointments={shown} period={period} />,
            <DentistsToday key="dentists" dentists={dentists} schedules={schedules} appointments={appointments} />,
            <ApprovalRequests key="approvals" appointments={appointments} onChanged={load} />,
          ]}
          bottomLeft={<CheckInList appointments={appointments} />}
          links={{ report: "/admin/reports", patients: "/admin/patients" }}
          patientTotals={{
            monthLabel: "New Patients This Month",
            allLabel: "Total Patients All Time",
            // Accounts from the day they registered; walk-in guests from their first visit.
            joined: [
              ...patients.flatMap((p) => (p.createdAt ? [{ date: manilaDateOf(p.createdAt), account: true }] : [])),
              ...firstVisits(appointments, true),
            ],
          }}
        />
      )}
    </div>
  );
}
