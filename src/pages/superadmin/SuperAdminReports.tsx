import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { appointmentRef } from "@/lib/appointmentRef";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL, PIN_COL, alignFor } from "@/lib/tableClass";
import CollapsedEmail from "@/components/CollapsedEmail";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, FileText, Search, Users, UserCog, Loader2 } from "lucide-react";
import ReportToolbar from "@/components/ReportToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import SortableHead from "@/components/SortableHead";
import { useTableSort } from "@/hooks/useTableSort";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, filterReportRows } from "@/lib/reportFilter";
import { toast } from "sonner";
import { getPatients, type Patient } from "@/lib/api/patients";
import { DAY_NAMES, getAllSchedules, getStaff, type DentistScheduleData, type StaffMember } from "@/lib/api/staff";
import { getLeave, leaveHours, shortRange, type LeaveRequest } from "@/lib/api/leave";
import { formatTimeRange } from "@/lib/dentistSchedules";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { groupGuests } from "@/lib/guests";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaDateTime, formatManilaStamp, manilaTodayDateStr } from "@/lib/formatDate";
import ReportOverview from "@/components/ReportOverview";
import type { Period } from "@/lib/reportPeriod";

type ReportType = "appointment" | "requests" | "walkin" | "patient" | "accounts" | "records" | "dental" | "schedule" | "leave";

/**
 * Every report the superadmin can print: their own summaries, and each list the front
 * desk and the dentists print from their pages, for the whole clinic. `pin`: the column
 * kept in view on a phone (whose row it is).
 */
const reportMeta: Record<ReportType, { title: string; columns: string[]; pin: number }> = {
  appointment: {
    title: "Appointment Summary Report",
    columns: ["Reference", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
    pin: 1,
  },
  requests: {
    title: "Appointment Requests Report",
    columns: ["Reference", "Patient Name", "Service", "Assigned Dentist", "Date", "Time", "Booked On", "Type", "Status"],
    pin: 1,
  },
  walkin: {
    title: "Walk-in Appointments Report",
    columns: ["Patient Name", "Service", "Dentist", "Date", "Time", "Status"],
    pin: 0,
  },
  patient: {
    title: "Patient Summary Report",
    columns: ["Patient Name", "Patient ID", "Contact Number", "Email Address", "Account", "Total Appointments", "Latest Consultation"],
    pin: 0,
  },
  accounts: {
    title: "Patient Accounts Report",
    columns: ["Patient Name", "Patient ID", "Email Address", "Account Status", "Date Registered"],
    pin: 0,
  },
  records: {
    title: "Patient Records Report",
    columns: ["Patient Name", "Patient ID", "Age", "Phone", "Email Address", "Status", "Walk-in"],
    pin: 0,
  },
  dental: {
    title: "Dental Records Report",
    columns: ["Date", "Patient Name", "Dentist", "Procedures", "Tooth No.", "Diagnosis", "Prescriptions"],
    pin: 1,
  },
  schedule: {
    title: "Staff Schedule Report",
    columns: ["Staff Name", "Role", "Day", "Working Hours", "Lunch Break"],
    pin: 0,
  },
  leave: {
    title: "Leave Report",
    columns: ["Staff Name", "Role", "Dates", "Hours", "Reason", "Requested", "Status", "Decided By"],
    pin: 0,
  },
};

/** The Report Type list, grouped by what it's about. */
const REPORT_GROUPS: { label: string; types: ReportType[] }[] = [
  { label: "Appointments", types: ["appointment", "requests", "walkin"] },
  { label: "Patients", types: ["patient", "accounts", "records", "dental"] },
  { label: "Staff", types: ["schedule", "leave"] },
];


/** "Rescheduled" from "rescheduled"; a request to move a booking, as the front desk sees it. */
const statusLabel = (a: Appointment) =>
  a.status === "pending" && a.rescheduleCount > 0 ? "Reschedule Request" : statusMeta[a.status]?.label ?? a.status;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Free text (names, services) may wrap; short values (dates, numbers, "No account")
 * stay on one line, so a row isn't made tall by a two-word status. */
const cellFit = (column: string) => (/name|service|dentist/i.test(column) ? WRAP_CELL : "whitespace-nowrap");

const roleLabel: Record<string, string> = {
  admin: "Clinic Admin",
  superadmin: "Super Admin",
  dentist: "Dentist",
  patient: "Patient",
};

const statusMeta: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "text-warning" },
  confirmed: { label: "Confirmed", className: "text-primary" },
  completed: { label: "Completed", className: "text-success" },
  cancelled: { label: "Cancelled", className: "text-destructive" },
  rejected: { label: "Rejected", className: "text-destructive" },
  rescheduled: { label: "Rescheduled", className: "text-warning" },
};

const statusClassByLabel = (label: string) =>
  Object.values(statusMeta).find((m) => m.label === label)?.className ?? "";

interface GeneratedReport {
  type: ReportType;
  rows: string[][];
  generatedAt: string;
}

export default function SuperAdminReports() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [schedules, setSchedules] = useState<Record<string, DentistScheduleData>>({});
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getPatients(), getStaff(), getAppointments(), getDentalRecords(),
      // Only the staff reports need these; the rest still work without them.
      getAllSchedules().catch(() => ({})), getLeave().catch(() => []),
    ])
      .then(([p, s, a, r, sch, l]) => {
        setPatients(p);
        setStaff(s);
        setAppointments(a);
        setRecords(r);
        setSchedules(sch);
        setLeave(l);
      })
      .catch(() => toast.error("Failed to load report data"))
      .finally(() => setLoading(false));
  }, []);

  const [type, setType] = useState<ReportType | "">("");
  // Applied to the generated report itself, so a long report can be narrowed without
  // running it again.
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  // The column pinned on a phone: the patient. The appointment report opens with its
  // reference code, so there the name is the second column.
  const pinnedCol = report ? reportMeta[report.type].pin : 0;

  // What the cards, the summary and the graphs count over; this month to begin with.
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));
  // The graphs, or the report builder; the generated report is kept while on the graphs.
  const [tab, setTab] = useState<"overview" | "report">("overview");

  const generate = () => {
    if (!type) {
      toast.error("Please select a report type first.");
      return;
    }

    let rows: string[][] = [];
    const newestFirst = (list: Appointment[]) => [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    if (type === "appointment") {
      rows = newestFirst(appointments)
        .map((a) => [appointmentRef(a), a.patientName, a.dentistName ?? "—", a.service, a.date, statusMeta[a.status]?.label ?? a.status]);
    } else if (type === "requests") {
      // As the front desk's Online Appointments list prints it: newest booking first.
      rows = [...appointments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => [
        appointmentRef(a), a.patientName, a.service, a.dentistName ?? "—", a.date, formatTimeRange(a.time, a.endTime),
        formatManilaStamp(a.createdAt), a.type === "walk-in" ? "Walk-in" : "Online", statusLabel(a),
      ]);
    } else if (type === "walkin") {
      rows = newestFirst(appointments.filter((a) => a.type === "walk-in")).map((a) => [
        a.patientName, a.service, a.dentistName ?? "—", a.date, formatTimeRange(a.time, a.endTime), statusLabel(a),
      ]);
    } else if (type === "accounts") {
      rows = patients.map((p) => [p.name, p.code ?? "—", p.email || "—", p.status === "active" ? "Active" : "Deactivated", p.createdAt?.slice(0, 10) ?? "—"]);
    } else if (type === "records") {
      // Account holders, then guests booked at the desk with no account.
      rows = [
        ...patients.map((p) => [
          p.name, p.code ?? "—", p.age != null ? String(p.age) : "—", p.phone || "—", p.email || "—", capitalize(p.status),
          appointments.some((a) => a.patientId === p.id && a.type === "walk-in") ? "Yes" : "No",
        ]),
        ...groupGuests(appointments).map((g) => [g.name, "—", "—", g.contact || "—", g.visits.find((a) => a.email)?.email ?? "—", "No account", "Yes"]),
      ];
    } else if (type === "dental") {
      rows = [...records].sort((a, b) => b.date.localeCompare(a.date)).map((r) => [
        r.date, r.patientName ?? "—", r.dentistName ?? "—",
        r.treatments.map((t) => t.serviceName).filter(Boolean).join(", ") || "—",
        r.toothNumber || "—", r.diagnosis, r.prescriptions.map((p) => p.medicine).join(", ") || "—",
      ]);
    } else if (type === "schedule") {
      // One row per working day, dentists then admins, each by name.
      rows = staff
        .filter((m) => m.role === "dentist" || m.role === "admin")
        .sort((a, b) => a.role.localeCompare(b.role) * -1 || a.name.localeCompare(b.name))
        .flatMap((m) => {
          const days = [...(schedules[m.id]?.days ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
          const role = roleLabel[m.role] ?? m.role;
          return days.length
            ? days.map((d) => [m.name, role, DAY_NAMES[d.dayOfWeek], formatTimeRange(d.start, d.end),
              d.lunchStart && d.lunchEnd ? formatTimeRange(d.lunchStart, d.lunchEnd) : "None"])
            : [[m.name, role, "—", "No working days set", "—"]];
        });
    } else if (type === "leave") {
      rows = [...leave].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => [
        l.dentistName, roleLabel[l.role] ?? l.role,
        shortRange(l.startDate, l.endDate)
          + (l.removedDates.length ? ` (${l.removedDates.length} removed)` : ""),
        leaveHours(l) ?? "Whole day",
        l.reason,
        formatManilaStamp(l.createdAt),
        capitalize(l.status) + (l.status === "rejected" && l.decisionReason ? `: ${l.decisionReason}` : ""),
        l.decidedBy ?? "—",
      ]);
    } else {
      const latestOf = (rs: typeof records) => rs.length
        ? rs.reduce((max, r) => (r.date > max ? r.date : max), rs[0].date)
        : "No consultations yet";

      const accountRows = patients.map((p) => {
        const patientAppointments = appointments.filter((a) => a.patientId === p.id);
        const patientRecords = records.filter((r) => r.patientId === p.id);
        return [p.name, p.code ?? "—", p.phone || "—", p.email || "—", "Registered", String(patientAppointments.length), latestOf(patientRecords)];
      });

      // Walk-ins booked for someone with no account have no patients row to hang off,
      // so they'd be invisible here. One row per guest (the name and number taken at the
      // desk), reaching their records through the appointment rather than a patient id.
      const guestRows = groupGuests(appointments).map((g) => {
        const ids = new Set(g.visits.map((a) => a.id));
        return [g.name, "—", g.contact || "—", "—", "No account", String(g.visits.length), latestOf(records.filter((r) => ids.has(r.appointmentId)))];
      });

      rows = [...accountRows, ...guestRows];
    }

    setFilter(EMPTY_FILTER);
    clearSort();
    setReport({ type, rows, generatedAt: formatManilaDateTime() });
    toast.success("Report preview generated");
  };

  const print = usePrintDocument();

  // The rows left after the on-screen filter: what is shown is what prints.
  const visibleRows = useMemo(
    () => (report ? filterReportRows(report.rows, filter) : []),
    [report, filter],
  );
  const { sorted: sortedRows, sortKey, headProps, clearSort } = useTableSort(visibleRows, (r) => r);
  const { page, setPage, paged } = usePagination(sortedRows, [filter, sortKey]);

  // What prints is what the screen shows.
  const handlePrint = () => {
    if (!report) return;
    const meta = reportMeta[report.type];
    print({
      title: meta.title,
      columns: meta.columns,
      rows: sortedRows,
      generatedAt: report.generatedAt,
      filters: filterIsActive(filter)
        ? [{ label: "Filtered By", value: describeReportFilter(meta.columns, filter) ?? "" }]
        : undefined,
    });
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports & Analytics</h1>
        <p className="text-muted-foreground">Appointment and patient reports</p>
      </div>

      <TabsList className="print:hidden">
        <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="w-4 h-4" /> Overview</TabsTrigger>
        <TabsTrigger value="report" className="gap-1.5"><FileText className="w-4 h-4" /> Generate Report</TabsTrigger>
      </TabsList>

      {loading ? (
        <div className="flex justify-center py-16 print:hidden"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <TabsContent value="overview" className="mt-0 space-y-4 print:hidden">
            {/* Patients and staff are all time; appointments the period's. */}
            <ReportOverview appointments={appointments} period={period} onPeriodChange={setPeriod} stats={[
              { label: "Patients", value: patients.length, icon: Users, note: "All time" },
              { label: "Staff", value: staff.length, icon: UserCog, note: "All time" },
            ]} />
          </TabsContent>

          <TabsContent value="report" className="mt-0 space-y-6">
          {/* One card: choosing the report, then the report itself under it. */}
          <Card className="shadow-card">
            <CardHeader className="print:hidden">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Generate Report
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* The type and the buttons on one line; on a phone the buttons go under it. */}
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3 print:hidden">
                <div className="space-y-2 w-full sm:w-72">
                  <Label>Report Type</Label>
                  <Select value={type} onValueChange={v => { setType(v as ReportType); setReport(null); }}>
                    <SelectTrigger><SelectValue placeholder="Select report" /></SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {REPORT_GROUPS.map((g) => (
                        <SelectGroup key={g.label}>
                          <SelectLabel>{g.label}</SelectLabel>
                          {g.types.map((t) => <SelectItem key={t} value={t}>{reportMeta[t].title}</SelectItem>)}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                <Button onClick={generate}>
                  <Search className="w-4 h-4 mr-2" /> Generate Report
                </Button>
                {report && <Button variant="outline" onClick={() => setReport(null)}>Clear Preview</Button>}
                </div>
              </div>

          {report && (
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h3 className="font-heading text-lg font-semibold">{reportMeta[report.type].title}</h3>
                  <p className="text-xs text-muted-foreground">Ayag Dental Clinic · Generated: {report.generatedAt}</p>
                </div>
                <ReportToolbar
                  columns={reportMeta[report.type].columns}
                  rows={report.rows}
                  filter={filter}
                  onChange={setFilter}
                  shown={visibleRows.length}
                  onPrint={handlePrint}
                />

                <div className="rounded-lg border overflow-x-auto">
                  <Table className={COMPACT_TABLE}>
                    <TableHeader>
                      <TableRow>
                        {reportMeta[report.type].columns.map((c, i) => <SortableHead key={c} {...headProps(i)} className={cn(i === pinnedCol && PIN_COL, alignFor(c))}>{c}</SortableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={reportMeta[report.type].columns.length} className="text-center text-muted-foreground py-8">
                            {report.rows.length === 0 ? "No records found." : "No records match this filter."}
                          </TableCell>
                        </TableRow>
                      ) : paged.map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className={cn(cellFit(reportMeta[report.type].columns[j]), reportMeta[report.type].columns[j] === "Status" && `font-medium ${statusClassByLabel(cell)}`, j === pinnedCol && PIN_COL, alignFor(reportMeta[report.type].columns[j]))}>
                              {/Email/.test(reportMeta[report.type].columns[j]) ? <CollapsedEmail email={cell} /> : cell}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
        <TablePagination
          page={page}
          onPageChange={setPage}
          total={visibleRows.length}
          pageSize={PAGE_SIZE}
          noun="row(s)"
        />
              </div>
          )}
            </CardContent>
          </Card>
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}
