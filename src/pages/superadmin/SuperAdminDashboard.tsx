import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Printer } from "lucide-react";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getAllSchedules, getStaff, type DentistScheduleData, type StaffMember } from "@/lib/api/staff";
import { byNewestAsk, getLeave, leaveHours, LEAVE_CHANGED, pendingChange, describeChange, type LeaveRequest } from "@/lib/api/leave";
import { manilaDateOf, manilaTodayAsLocalDate, manilaTodayDateStr } from "@/lib/formatDate";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { PeriodPicker } from "@/components/ReportOverview";
import ClinicDashboard, { TopTreatments } from "@/components/ClinicDashboard";
import { DentistWorkload, LeaveApprovals, StaffOnDuty } from "@/components/StaffDashboardCards";
import { dashboardPrintTables, firstVisits } from "@/lib/dashboardStats";
import { inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";
import { cellFor, cellText, leaveDays } from "@/lib/staffDay";

/** The clinic at a glance for the period, from the Super Admin's side: the numbers and
 * graphs, who is working today, the leave waiting for a decision, and each dentist's
 * workload. The detail lives in Reports & Analytics and Schedule. */
export default function SuperAdminDashboard() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [schedules, setSchedules] = useState<Record<string, DentistScheduleData>>({});
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));

  const load = useCallback(() => {
    // Schedules and leave only fill the staff cards: if they fail, the rest still shows.
    return Promise.all([
      getPatients(), getAppointments(), getStaff(),
      getAllSchedules().catch(() => ({})), getLeave().catch(() => [] as LeaveRequest[]),
    ]).then(([p, a, s, sch, l]) => {
      setPatients(p);
      setAppointments(a);
      setStaff(s);
      setSchedules(sch);
      setLeave(l);
    });
  }, []);
  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // A leave decided here turns into days off, so the day's staff is read again too.
    const reload = () => { load(); };
    window.addEventListener(LEAVE_CHANGED, reload);
    return () => window.removeEventListener(LEAVE_CHANGED, reload);
  }, [load]);

  const shown = useMemo(() => inPeriod(appointments, period), [appointments, period]);
  const team = staff.filter((s) => (s.role === "dentist" || s.role === "admin") && s.status === "active");
  const pendingLeave = leave.filter((l) => l.status === "pending" || pendingChange(l)).sort(byNewestAsk);

  const print = usePrintDocument();
  const handlePrint = () => {
    const today = manilaTodayAsLocalDate();
    const todayKey = manilaTodayDateStr();
    print({
      title: "System Overview",
      showTotal: false,
      filters: [{ label: "Period", value: periodLabel(period) }],
      tables: [
        // The front desk's lists are the front desk's; the Super Admin's are staff ones.
        ...dashboardPrintTables(appointments, period).filter((t) => t.heading !== "Approval Requests" && t.heading !== "Today's Appointments"),
        {
          heading: "Staff on Duty Today",
          columns: ["Name", "Role", "Today", "Appointments"],
          rows: team.map((s) => [
            s.name, s.role === "dentist" ? "Dentist" : "Admin", cellText(cellFor(schedules[s.id], today)),
            s.role === "dentist"
              ? String(appointments.filter((a) => a.date === todayKey && a.status !== "cancelled" && a.status !== "rejected"
                && (a.dentistId === s.id || a.dentistName === s.name)).length)
              : "—",
          ]),
          emptyText: "No active staff.",
        },
        {
          heading: "Leave Requests",
          columns: ["Name", "Role", "Dates", "Reason", "Request"],
          rows: pendingLeave.map((l) => [
            l.dentistName, l.role === "dentist" ? "Dentist" : "Admin",
            `${leaveDays(l)}${leaveHours(l) ? `, ${leaveHours(l)}` : ""}`, l.reason,
            pendingChange(l) ? `Change: ${describeChange(l.changeRequest!)}` : "New leave",
          ]),
          emptyText: "No leave waiting for approval.",
        },
        {
          heading: "Appointments by Dentist",
          columns: ["Dentist", "Appointments", "Completed"],
          rows: [...new Set(shown.map((a) => a.dentistName ?? "Unassigned"))].map((name) => {
            const mine = shown.filter((a) => (a.dentistName ?? "Unassigned") === name);
            return [name, String(mine.length), String(mine.filter((a) => a.status === "completed").length)];
          }).sort((a, b) => Number(b[1]) - Number(a[1])),
          emptyText: "No appointments in this period.",
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
        <ClinicDashboard
          appointments={appointments}
          period={period}
          links={{ report: "/superadmin/reports", patients: "/superadmin/reports" }}
          patientTotals={{
            monthLabel: "New Patients This Month",
            allLabel: "Total Patients All Time",
            // Accounts from the day they registered; walk-in guests from their first visit.
            joined: [
              ...patients.flatMap((p) => (p.createdAt ? [{ date: manilaDateOf(p.createdAt), account: true }] : [])),
              ...firstVisits(appointments, true),
            ],
          }}
          middle={[
            <TopTreatments key="top" appointments={shown} period={period} />,
            <StaffOnDuty key="duty" staff={staff} schedules={schedules} appointments={appointments} />,
            <LeaveApprovals key="leave" leave={leave} />,
          ]}
          bottomLeft={<DentistWorkload appointments={shown} period={period} />}
        />
      )}
    </div>
  );
}
