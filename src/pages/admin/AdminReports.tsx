import { useEffect, useMemo, useState } from "react";
import { appointmentRef } from "@/lib/appointmentRef";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Search, Loader2 } from "lucide-react";
import ReportToolbar, { ALL_FIELDS } from "@/components/ReportToolbar";
import { toast } from "sonner";
import { getAppointments, type Appointment, type AptStatus } from "@/lib/api/appointments";
import { getPatients, type Patient } from "@/lib/api/patients";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { printReport } from "@/lib/printReport";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaDateTime } from "@/lib/formatDate";

type ReportType = "appointment" | "walkin" | "patient";

const reportMeta: Record<ReportType, { title: string; columns: string[] }> = {
  appointment: {
    title: "Appointment Report",
    columns: ["Reference", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
  },
  walkin: { title: "Walk-in Report", columns: ["Patient Name", "Dentist", "Date", "Time"] },
  patient: { title: "Patient Report", columns: ["Patient Information", "Total Appointments", "Latest Consultation"] },
};

const roleLabel: Record<string, string> = {
  admin: "Clinic Admin",
  superadmin: "Super Admin",
  dentist: "Dentist",
  patient: "Patient",
};

const statuses: AptStatus[] = ["pending", "confirmed", "completed", "cancelled", "rejected", "rescheduled"];
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const statusVariant = (s: string) =>
  s === "Completed" ? "text-success" : s === "Confirmed" ? "text-primary" : s === "Pending" ? "text-warning" : "text-destructive";

interface GeneratedReport {
  type: ReportType;
  rows: string[][];
  filters: { start: string; end: string; dentist: string; status: string };
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

  const dentists = useMemo(
    () => Array.from(new Set(appointments.map(a => a.dentistName).filter((n): n is string => !!n))).sort(),
    [appointments],
  );

  const [type, setType] = useState<ReportType | "">("");
  // Applied to the generated report itself, so a long report can be narrowed without
  // running it again.
  const [rowFilter, setRowFilter] = useState("");
  /** "all", or the index of the column to search. */
  const [filterField, setFilterField] = useState(ALL_FIELDS);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [dentist, setDentist] = useState("all");
  const [status, setStatus] = useState("all");
  const [report, setReport] = useState<GeneratedReport | null>(null);

  const inRange = (d: string) => (!start || d >= start) && (!end || d <= end);

  const generate = () => {
    if (!type) {
      toast.error("Please select a report type first.");
      return;
    }
    if (start && end && start > end) {
      toast.error("Start date must be before the end date.");
      return;
    }

    let rows: string[][] = [];

    if (type === "appointment") {
      rows = appointments
        .filter((a) => inRange(a.date) && (dentist === "all" || a.dentistName === dentist) && (status === "all" || a.status === status))
        .map((a) => [appointmentRef(a.id), a.patientName, a.dentistName ?? "—", a.service, a.date, capitalize(a.status)]);
    } else if (type === "walkin") {
      rows = appointments
        .filter((a) => a.type === "walk-in" && inRange(a.date) && (dentist === "all" || a.dentistName === dentist) && (status === "all" || a.status === status))
        .map((a) => [a.patientName, a.dentistName ?? "—", a.date, toLabel(toMinutes(a.time))]);
    } else {
      const accountRows = patients
        .map((p) => {
          const own = appointments.filter((a) => a.patientId === p.id);
          const latest = own.map((a) => a.date).sort().at(-1) ?? "";
          return { label: `${p.name} — ${p.email} · ${p.phone || "—"}`, total: own.length, latest };
        });

      // Walk-ins booked for someone with no account have no patients row to hang off,
      // so they'd be invisible here. Group those by the name taken at the desk.
      const guests = new Map<string, Appointment[]>();
      for (const a of appointments.filter((a) => !a.patientId)) {
        const list = guests.get(a.patientName) ?? [];
        list.push(a);
        guests.set(a.patientName, list);
      }
      const guestRows = [...guests.entries()].map(([name, own]) => ({
        label: `${name} — No account (walk-in)`,
        total: own.length,
        latest: own.map((a) => a.date).sort().at(-1) ?? "",
      }));

      rows = [...accountRows, ...guestRows]
        .filter(({ latest }) => !start && !end ? true : latest && inRange(latest))
        .map(({ label, total, latest }) => [label, String(total), latest || "—"]);
    }

    setRowFilter("");
    setFilterField(ALL_FIELDS);
    setReport({
      type,
      rows,
      filters: { start, end, dentist, status },
      generatedAt: formatManilaDateTime(),
    });
    toast.success("Report preview generated");
  };

  // The rows left after the on-screen filter: what is shown is what prints. "all"
  // searches every column; otherwise only the chosen one, so "Oral" can mean the
  // service and not a patient called Oral.
  const visibleRows = useMemo(() => {
    const q = rowFilter.trim().toLowerCase();
    if (!report) return [];
    if (!q) return report.rows;
    const col = filterField === ALL_FIELDS ? -1 : Number(filterField);
    return report.rows.filter((r) =>
      (col < 0 ? r.join(" ") : r[col] ?? "").toLowerCase().includes(q));
  }, [report, rowFilter, filterField]);

  // Both buttons print the same document — one to paper, one to a PDF — so a printed
  // copy never depends on what the screen happened to look like.
  const sendToPrinter = (what: string) => {
    if (!report) return;
    const meta = reportMeta[report.type];
    const ok = printReport({
      title: meta.title,
      columns: meta.columns,
      rows: visibleRows,
      generatedAt: report.generatedAt,
      preparedBy: { name: user?.name ?? "—", role: roleLabel[user?.role ?? ""] ?? "Staff" },
      filters: [
        { label: "Date Range", value: `${report.filters.start || "All"} to ${report.filters.end || "All"}` },
        { label: "Dentist", value: report.filters.dentist === "all" ? "All dentists" : report.filters.dentist },
        { label: "Status", value: report.filters.status === "all" ? "All statuses" : capitalize(report.filters.status) },
        ...(rowFilter.trim()
          ? [{
              label: "Filtered By",
              value: filterField === ALL_FIELDS
                ? rowFilter.trim()
                : `${meta.columns[Number(filterField)]}: ${rowFilter.trim()}`,
            }]
          : []),
      ],
    });
    if (ok) toast.success(`${what} ready`);
    else toast.error(`Failed to prepare the ${what.toLowerCase()}`);
  };

  const handlePrint = () => sendToPrinter("Print preview");

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports</h1>
        <p className="text-muted-foreground">Select filters, generate a preview, then download or print</p>
      </div>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Report Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Start Date (optional)</Label>
              <Input type="date" aria-label="Start date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Input type="date" aria-label="End date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dentist (optional)</Label>
              <Select value={dentist} onValueChange={setDentist} disabled={type === "patient"}>
                <SelectTrigger aria-label="Dentist"><SelectValue placeholder="All dentists" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Dentists</SelectItem>
                  {dentists.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status (optional)</Label>
              <Select value={status} onValueChange={setStatus} disabled={type === "patient"}>
                <SelectTrigger aria-label="Status"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>{capitalize(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={generate}>
              <Search className="w-4 h-4 mr-2" /> Generate Report
            </Button>
            {report && (
              <Button variant="outline" onClick={() => setReport(null)}>Clear Preview</Button>
            )}
          </div>
          </>
          )}
        </CardContent>
      </Card>

      {report && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-lg">
              {reportMeta[report.type].title}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Date Range: {report.filters.start || "All"} to {report.filters.end || "All"} ·
              Dentist: {report.filters.dentist === "all" ? "All" : report.filters.dentist} ·
              Status: {report.filters.status === "all" ? "All" : capitalize(report.filters.status)} ·
              Generated: {report.generatedAt}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ReportToolbar
              columns={reportMeta[report.type].columns}
              rows={report.rows}
              field={filterField}
              onFieldChange={setFilterField}
              value={rowFilter}
              onValueChange={setRowFilter}
              shown={visibleRows.length}
              onPrint={handlePrint}
            />

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportMeta[report.type].columns.map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={reportMeta[report.type].columns.length} className="text-center text-muted-foreground py-8">
                        {report.rows.length === 0
                          ? "No records found for the selected filters."
                          : `No records match "${rowFilter.trim()}".`}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visibleRows.map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j} className={report.type === "appointment" && j === 5 ? `font-medium ${statusVariant(cell)}` : ""}>
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
