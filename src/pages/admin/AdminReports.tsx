import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { appointmentRef } from "@/lib/appointmentRef";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL, PIN_COL, alignFor } from "@/lib/tableClass";
import CollapsedEmail from "@/components/CollapsedEmail";
import { Badge } from "@/components/ui/badge";
import { BarChart3, FileText, Footprints, Search, Loader2, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReportOverview from "@/components/ReportOverview";
import { inPeriod, periodLabel, type Period } from "@/lib/reportPeriod";
import ReportToolbar from "@/components/ReportToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import SortableHead from "@/components/SortableHead";
import { useTableSort } from "@/hooks/useTableSort";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, filterReportRows } from "@/lib/reportFilter";
import { toast } from "sonner";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { groupGuests } from "@/lib/guests";
import { getPatients, type Patient } from "@/lib/api/patients";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaDateTime, manilaTodayDateStr } from "@/lib/formatDate";

type ReportType = "appointment" | "walkin" | "patient";

const reportMeta: Record<ReportType, { title: string; columns: string[] }> = {
  appointment: {
    title: "Appointment Report",
    columns: ["Reference", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
  },
  walkin: {
    title: "Walk-in Report",
    columns: ["Patient Name", "Contact Number", "Service", "Dentist", "Date", "Time", "Status"],
  },
  patient: { title: "Patient Report", columns: ["Patient Name", "Patient ID", "Contact Number", "Email Address", "Account", "Total Appointments", "Latest Consultation"] },
};

/** Free text (names, services) may wrap; short values (dates, numbers, "No account")
 * stay on one line, so a row isn't made tall by a two-word status. */
const cellFit = (column: string) => (/name|service|dentist/i.test(column) ? WRAP_CELL : "whitespace-nowrap");

const roleLabel: Record<string, string> = {
  admin: "Clinic Admin",
  superadmin: "Super Admin",
  dentist: "Dentist",
  patient: "Patient",
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s: string) =>
  s === "Completed" ? "text-success" : s === "Confirmed" ? "text-primary" : s === "Pending" ? "text-warning" : "text-destructive";

interface GeneratedReport {
  type: ReportType;
  rows: string[][];
  generatedAt: string;
}

export default function AdminReports() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAppointments(), getPatients()])
      .then(([a, p]) => { setAppointments(a); setPatients(p); })
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
  const pinnedCol = report?.type === "appointment" ? 1 : 0;

  // What the overview counts over; this month to begin with. The report has its own dates.
  const [period, setPeriod] = useState<Period>(() => ({ kind: "month", month: manilaTodayDateStr().slice(0, 7) }));
  const walkIns = useMemo(() => inPeriod(appointments, period).filter((a) => a.type === "walk-in").length, [appointments, period]);
  const [tab, setTab] = useState<"overview" | "report">("overview");

  const generate = () => {
    if (!type) {
      toast.error("Please select a report type first.");
      return;
    }

    let rows: string[][] = [];

    if (type === "appointment") {
      rows = appointments
        .map((a) => [appointmentRef(a), a.patientName, a.dentistName ?? "—", a.service, a.date, capitalize(a.status)]);
    } else if (type === "walkin") {
      rows = appointments
        .filter((a) => a.type === "walk-in")
        .map((a) => [a.patientName, a.contact || "—", a.service, a.dentistName ?? "—", a.date, toLabel(toMinutes(a.time)), capitalize(a.status)]);
    } else {
      const accountRows = patients
        .map((p) => {
          const own = appointments.filter((a) => a.patientId === p.id);
          const latest = own.map((a) => a.date).sort().at(-1) ?? "";
          return { info: [p.name, p.code ?? "—", p.phone || "—", p.email, "Registered"], total: own.length, latest };
        });

      // Walk-ins booked for someone with no account have no patients row to hang off,
      // so they'd be invisible here. One row per guest: the name and number taken at the desk.
      const guestRows = groupGuests(appointments).map((g) => ({
        info: [g.name, "—", g.contact || "—", "—", "No account"],
        total: g.visits.length,
        latest: g.visits[0]?.date ?? "",
      }));

      rows = [...accountRows, ...guestRows]
        .map(({ info, total, latest }) => [...info, String(total), latest || "—"]);
    }

    setFilter(EMPTY_FILTER);
    clearSort();
    setReport({
      type,
      rows,
      generatedAt: formatManilaDateTime(),
    });
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

  // What prints is what the screen shows, so a printed copy never depends on what the
  // screen happened to look like.
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
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
        <p className="text-muted-foreground">How the clinic is doing, and reports to print</p>
      </div>

      <TabsList className="print:hidden">
        <TabsTrigger value="overview" className="gap-1.5"><BarChart3 className="w-4 h-4" /> Overview</TabsTrigger>
        <TabsTrigger value="report" className="gap-1.5"><FileText className="w-4 h-4" /> Generate Report</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-0 space-y-4 print:hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          // Patients are all time; appointments and walk-ins the period's.
          <ReportOverview appointments={appointments} period={period} onPeriodChange={setPeriod} stats={[
            { label: "Patients", value: patients.length, icon: Users, note: "All time" },
            { label: "Walk-ins", value: walkIns, icon: Footprints, note: periodLabel(period) },
          ]} />
        )}
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
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
          // The type and the buttons on one line; on a phone the buttons go under it.
          <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3 print:hidden">
            <div className="space-y-2 w-full sm:w-72">
              <Label>Report Type</Label>
              <Select value={type} onValueChange={(v) => { setType(v as ReportType); setReport(null); }}>
                <SelectTrigger aria-label="Report type"><SelectValue placeholder="Select report" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="appointment">Appointment Report</SelectItem>
                  <SelectItem value="walkin">Walk-in Report</SelectItem>
                  <SelectItem value="patient">Patient Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={generate}>
                <Search className="w-4 h-4 mr-2" /> Generate Report
              </Button>
              {report && (
                <Button variant="outline" onClick={() => setReport(null)}>Clear Preview</Button>
              )}
            </div>
          </div>
          )}

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
                        {report.rows.length === 0
                          ? "No records found for the selected filters."
                          : "No records match this filter."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j} className={cn(cellFit(reportMeta[report.type].columns[j]), report.type === "appointment" && j === 5 && `font-medium ${statusVariant(cell)}`, j === pinnedCol && PIN_COL, alignFor(reportMeta[report.type].columns[j]))}>
                            {/Email/.test(reportMeta[report.type].columns[j]) ? <CollapsedEmail email={cell} /> : cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
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
    </Tabs>
  );
}
