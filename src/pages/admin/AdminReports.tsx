import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Printer, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getAppointments, type Appointment, type AptStatus } from "@/lib/api/appointments";
import { getPatients, type Patient } from "@/lib/api/patients";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { printHtmlAsPdf } from "@/lib/printPdf";

type ReportType = "appointment" | "walkin" | "patient";

const reportMeta: Record<ReportType, { title: string; columns: string[] }> = {
  appointment: {
    title: "Appointment Report",
    columns: ["Appointment ID", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
  },
  walkin: { title: "Walk-in Report", columns: ["Patient Name", "Dentist", "Date", "Time"] },
  patient: { title: "Patient Report", columns: ["Patient Information", "Total Appointments", "Latest Consultation"] },
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
        .map((a) => [a.id, a.patientName, a.dentistName ?? "—", a.service, a.date, capitalize(a.status)]);
    } else if (type === "walkin") {
      rows = appointments
        .filter((a) => a.type === "walk-in" && inRange(a.date) && (dentist === "all" || a.dentistName === dentist) && (status === "all" || a.status === status))
        .map((a) => [a.patientName, a.dentistName ?? "—", a.date, toLabel(toMinutes(a.time))]);
    } else {
      rows = patients
        .map((p) => {
          const own = appointments.filter((a) => a.patientId === p.id);
          const latest = own.map((a) => a.date).sort().at(-1) ?? "";
          return { p, total: own.length, latest };
        })
        .filter(({ latest }) => !start && !end ? true : latest && inRange(latest))
        .map(({ p, total, latest }) => [`${p.name} — ${p.email} · ${p.phone ?? "—"}`, String(total), latest || "—"]);
    }

    setReport({
      type,
      rows,
      filters: { start, end, dentist, status },
      generatedAt: new Date().toLocaleString(),
    });
    toast.success("Report preview generated");
  };

  const handlePrint = () => window.print();

  const handleDownloadPdf = () => {
    if (!report) return;
    const meta = reportMeta[report.type];
    const rowsHtml = report.rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("");
    const body = `
      <h1>Ayag Dental Clinic — ${meta.title}</h1>
      <p class="meta">Date Range: ${report.filters.start || "All"} to ${report.filters.end || "All"} |
        Dentist: ${report.filters.dentist === "all" ? "All" : report.filters.dentist} |
        Status: ${report.filters.status === "all" ? "All" : capitalize(report.filters.status)} |
        Generated: ${report.generatedAt}</p>
      <table><thead><tr>${meta.columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${meta.columns.length}">No records found</td></tr>`}</tbody></table>`;
    if (printHtmlAsPdf(meta.title, body)) {
      toast.success("PDF export ready");
    } else {
      toast.error("Failed to prepare PDF");
    }
  };

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
                <SelectTrigger><SelectValue placeholder="Select report" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="appointment">Appointment Report</SelectItem>
                  <SelectItem value="walkin">Walk-in Report</SelectItem>
                  <SelectItem value="patient">Patient Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Start Date (optional)</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>End Date (optional)</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Dentist (optional)</Label>
              <Select value={dentist} onValueChange={setDentist} disabled={type === "patient"}>
                <SelectTrigger><SelectValue placeholder="All dentists" /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
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
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={reportMeta[report.type].columns.length} className="text-center text-muted-foreground py-8">
                        No records found for the selected filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.rows.map((row, i) => (
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

            <div className="flex items-center justify-between gap-2 print:hidden">
              <Badge variant="secondary">{report.rows.length} record(s)</Badge>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> Print Report
                </Button>
                <Button onClick={handleDownloadPdf}>
                  <Download className="w-4 h-4 mr-2" /> Download PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
