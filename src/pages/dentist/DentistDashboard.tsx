import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getDentistSchedule, type DentistScheduleData } from "@/lib/api/staff";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { PeriodPicker } from "@/components/ReportOverview";
import ClinicDashboard, { NextPatient } from "@/components/ClinicDashboard";
import { MyScheduleToday } from "@/components/TodayCards";
import { FollowUpsDue, RecordsToWrite } from "@/components/DentistWorkCards";
import { dashboardPrintTables, firstVisits } from "@/lib/dashboardStats";
import { periodLabel, type Period } from "@/lib/reportPeriod";

/** A dentist's dashboard, of their own appointments only. */
export default function DentistDashboard() {
  const { user } = useAuth();
  const userId = user?.id;
  const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));

  const load = useCallback(() => {
    // The patient list only adds the next patient's ID, age and gender: without it the
    // dashboard still stands.
    return Promise.all([
      getAppointments(), getPatients().catch(() => [] as Patient[]), getDentalRecords().catch(() => [] as DentalRecord[]),
      userId ? getDentistSchedule(userId).catch(() => null) : Promise.resolve(null),
    ]).then(([a, p, r, sch]) => {
      setAllAppointments(a);
      setPatients(p);
      setRecords(r);
      setSchedule(sch);
    });
  }, [userId]);
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const appointments = useMemo(
    () => allAppointments.filter(a => !user?.name || a.dentistName === user.name),
    [allAppointments, user],
  );
  // Their own records only: the dentist on the record, by id or (older ones) by name.
  const myRecords = useMemo(
    () => records.filter((r) => r.dentistId === userId || (!!user?.name && r.dentistName === user.name)),
    [records, userId, user],
  );

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Dashboard Summary",
      showTotal: false,
      filters: [{ label: "Dentist", value: user?.name ?? "" }, { label: "Period", value: periodLabel(period) }],
      tables: dashboardPrintTables(appointments, period),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your day, {user?.name || "Doctor"}</p>
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
            <NextPatient key="next" appointments={appointments} patients={patients} />,
            <MyScheduleToday key="today" schedule={schedule} appointments={appointments} />,
            <RecordsToWrite key="records" appointments={appointments} records={myRecords} />,
          ]}
          bottomLeft={<FollowUpsDue records={myRecords} appointments={appointments} />}
          links={{ report: "/dentist/appointments", reportLabel: "View all", patients: "/dentist/patient-history" }}
          patientTotals={{
            monthLabel: "Your New Patients This Month",
            allLabel: "Your Patients All Time",
            // Each patient from their first visit with this dentist.
            joined: firstVisits(appointments),
          }}
        />
      )}
    </div>
  );
}
