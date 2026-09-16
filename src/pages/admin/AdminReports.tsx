import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { dentistSchedules } from "@/lib/dentistSchedules";

type ReportType = "appointment" | "walkin" | "patient";

const reportMeta: Record<ReportType, { title: string; columns: string[] }> = {
  appointment: {
    title: "Appointment Report",
    columns: ["Appointment ID", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
  },
  walkin: { title: "Walk-in Report", columns: ["Patient Name", "Dentist", "Date", "Time"] },
  patient: { title: "Patient Report", columns: ["Patient Information", "Total Appointments", "Latest Consultation"] },
};

const appointmentData = [
  { id: "APT-1001", patient: "Maria Santos", dentist: "Dr. Ayag", service: "Dental Cleaning", date: "2026-08-01", time: "09:00 AM", status: "Completed", type: "Online" },
  { id: "APT-1002", patient: "Juan Dela Cruz", dentist: "Dr. Santos", service: "Tooth Extraction", date: "2026-08-03", time: "10:30 AM", status: "Confirmed", type: "Walk-in" },
  { id: "APT-1003", patient: "Ana Reyes", dentist: "Dr. Ayag", service: "Root Canal", date: "2026-08-05", time: "01:00 PM", status: "Pending", type: "Online" },
  { id: "APT-1004", patient: "Carlos Mendoza", dentist: "Dr. Santos", service: "Braces Adjustment", date: "2026-08-06", time: "02:30 PM", status: "Cancelled", type: "Online" },
  { id: "APT-1005", patient: "Liza Bautista", dentist: "Dr. Ayag", service: "Tooth Filling", date: "2026-08-07", time: "11:00 AM", status: "Confirmed", type: "Walk-in" },
  { id: "APT-1006", patient: "Mark Villanueva", dentist: "Dr. Santos", service: "Teeth Whitening", date: "2026-08-08", time: "03:00 PM", status: "Completed", type: "Walk-in" },
];

const patientData = [
  { name: "Maria Santos", email: "maria@example.com", phone: "0917-555-0101", total: 8, latest: "2026-08-01" },
  { name: "Juan Dela Cruz", email: "juan@example.com", phone: "0917-555-0102", total: 4, latest: "2026-08-03" },
  { name: "Ana Reyes", email: "ana@example.com", phone: "0917-555-0103", total: 2, latest: "2026-08-05" },
  { name: "Carlos Mendoza", email: "carlos@example.com", phone: "0917-555-0104", total: 6, latest: "2026-08-06" },
  { name: "Liza Bautista", email: "liza@example.com", phone: "0917-555-0105", total: 3, latest: "2026-08-07" },
];

const statuses = ["Pending", "Confirmed", "Completed", "Cancelled", "Rejected"];

const statusVariant = (s: string) =>
  s === "Completed" ? "text-success" : s === "Confirmed" ? "text-primary" : s === "Pending" ? "text-warning" : "text-destructive";

interface GeneratedReport {
  type: ReportType;
  rows: string[][];
  filters: { start: string; end: string; dentist: string; status: string };
  generatedAt: string;
}

export default function AdminReports() {
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
      rows = appointmentData
        .filter((a) => inRange(a.date) && (dentist === "all" || a.dentist === dentist) && (status === "all" || a.status === status))
        .map((a) => [a.id, a.patient, a.dentist, a.service, a.date, a.status]);
    } else if (type === "walkin") {
      rows = appointmentData
        .filter((a) => a.type === "Walk-in" && inRange(a.date) && (dentist === "all" || a.dentist === dentist) && (status === "all" || a.status === status))
        .map((a) => [a.patient, a.dentist, a.date, a.time]);
    } else {
      rows = patientData
        .filter((p) => inRange(p.latest))
        .map((p) => [`${p.name} — ${p.email} · ${p.phone}`, String(p.total), p.latest]);
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
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.error("Please allow pop-ups to download the PDF.");
      return;
    }
    const rowsHtml = report.rows
      .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("");
    win.document.write(`<!doctype html><html><head><title>${meta.title}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:32px;color:#1f2937}
        h1{font-size:20px;margin:0 0 4px}
        p.meta{font-size:12px;color:#6b7280;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
        th{background:#f3f4f6}
      </style></head><body>
      <h1>Ayag Dental Clinic — ${meta.title}</h1>
      <p class="meta">Date Range: ${report.filters.start || "All"} to ${report.filters.end || "All"} |
        Dentist: ${report.filters.dentist === "all" ? "All" : report.filters.dentist} |
        Status: ${report.filters.status === "all" ? "All" : report.filters.status} |
        Generated: ${report.generatedAt}</p>
      <table><thead><tr>${meta.columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="${meta.columns.length}">No records found</td></tr>`}</tbody></table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    toast.success("PDF export ready");
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
                  {dentistSchedules.map((d) => (
                    <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
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
                    <SelectItem key={s} value={s}>{s}</SelectItem>
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
              Status: {report.filters.status === "all" ? "All" : report.filters.status} ·
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
