import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatCard from "@/components/StatCard";
import { BarChart3, CalendarDays, Download, FileText, Printer, Search, Users, UserCog } from "lucide-react";
import { toast } from "sonner";
import { usePatientAccounts } from "@/lib/accountStore";
import { useActiveStaff } from "@/lib/staffStore";

type ReportType = "appointment" | "patient" | "dentist";

const reportMeta: Record<ReportType, { title: string; columns: string[] }> = {
  appointment: {
    title: "Appointment Summary Report",
    columns: ["Appointment ID", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
  },
  patient: {
    title: "Patient Summary Report",
    columns: ["Patient Information", "Total Appointments", "Latest Consultation"],
  },
  dentist: {
    title: "Dentist Performance Report",
    columns: ["Dentist", "Total Appointments", "Completed", "Cancelled", "Patients Handled"],
  },
};

const appointmentData = [
  { id: "APT-1001", patient: "Maria Santos", dentist: "Dr. Ayag", service: "Dental Cleaning", date: "2026-08-01", status: "Completed" },
  { id: "APT-1002", patient: "Juan Dela Cruz", dentist: "Dr. Santos", service: "Tooth Extraction", date: "2026-08-03", status: "Confirmed" },
  { id: "APT-1003", patient: "Ana Reyes", dentist: "Dr. Ayag", service: "Root Canal", date: "2026-08-05", status: "Pending" },
  { id: "APT-1004", patient: "Carlos Mendoza", dentist: "Dr. Santos", service: "Braces Adjustment", date: "2026-08-06", status: "Cancelled" },
  { id: "APT-1005", patient: "Liza Bautista", dentist: "Dr. Ayag", service: "Tooth Filling", date: "2026-08-07", status: "Confirmed" },
  { id: "APT-1006", patient: "Mark Villanueva", dentist: "Dr. Santos", service: "Teeth Whitening", date: "2026-08-08", status: "Completed" },
  { id: "APT-1007", patient: "Grace Lim", dentist: "Dr. Ayag", service: "Dental Cleaning", date: "2026-08-10", status: "Completed" },
  { id: "APT-1008", patient: "Peter Uy", dentist: "Dr. Santos", service: "Tooth Filling", date: "2026-08-11", status: "Pending" },
];

const patientData = [
  { name: "Maria Santos", email: "maria@example.com", phone: "0917-555-0101", total: 8, latest: "2026-08-01" },
  { name: "Juan Dela Cruz", email: "juan@example.com", phone: "0917-555-0102", total: 4, latest: "2026-08-03" },
  { name: "Ana Reyes", email: "ana@example.com", phone: "0917-555-0103", total: 2, latest: "2026-08-05" },
  { name: "Carlos Mendoza", email: "carlos@example.com", phone: "0917-555-0104", total: 6, latest: "2026-08-06" },
  { name: "Liza Bautista", email: "liza@example.com", phone: "0917-555-0105", total: 3, latest: "2026-08-07" },
];

const statusList = ["Pending", "Confirmed", "Completed", "Cancelled"] as const;

const statusColor: Record<string, string> = {
  Pending: "text-warning",
  Confirmed: "text-primary",
  Completed: "text-success",
  Cancelled: "text-destructive",
};

interface GeneratedReport {
  type: ReportType;
  rows: string[][];
  generatedAt: string;
}

export default function SuperAdminReports() {
  const [type, setType] = useState<ReportType | "">("");
  const [report, setReport] = useState<GeneratedReport | null>(null);

  const patients = usePatientAccounts();
  const staff = useActiveStaff();

  const statusCounts = statusList.map(s => ({
    label: s,
    count: appointmentData.filter(a => a.status === s).length,
  }));
  const totalAppointments = appointmentData.length;

  const generate = () => {
    if (!type) {
      toast.error("Please select a report type first.");
      return;
    }

    let rows: string[][] = [];
    if (type === "appointment") {
      rows = appointmentData.map(a => [a.id, a.patient, a.dentist, a.service, a.date, a.status]);
    } else if (type === "patient") {
      rows = patientData.map(p => [`${p.name} — ${p.email} · ${p.phone}`, String(p.total), p.latest]);
    } else {
      const dentists = Array.from(new Set(appointmentData.map(a => a.dentist)));
      rows = dentists.map(d => {
        const own = appointmentData.filter(a => a.dentist === d);
        return [
          d,
          String(own.length),
          String(own.filter(a => a.status === "Completed").length),
          String(own.filter(a => a.status === "Cancelled").length),
          String(new Set(own.map(a => a.patient)).size),
        ];
      });
    }

    setReport({ type, rows, generatedAt: new Date().toLocaleString() });
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
    const rowsHtml = report.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("");
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
      <p class="meta">Generated: ${report.generatedAt}</p>
      <table><thead><tr>${meta.columns.map(c => `<th>${c}</th>`).join("")}</tr></thead>
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
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports & Analytics</h1>
        <p className="text-muted-foreground">Appointment, patient, and dentist reports</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <StatCard title="Total Registered Patients" value={patients.length} icon={Users} delay={0} />
        <StatCard title="Total Appointments" value={totalAppointments} icon={CalendarDays} delay={0.1} />
        <StatCard title="Total Staff" value={staff.length} icon={UserCog} delay={0.2} />
      </div>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Appointment Status Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statusCounts.map(item => {
              const pct = totalAppointments ? Math.round((item.count / totalAppointments) * 100) : 0;
              return (
                <div key={item.label} className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`font-bold text-xl mt-1 ${statusColor[item.label]}`}>{item.count}</p>
                  <div className="w-full h-2 bg-secondary rounded-full mt-2">
                    <div className="h-2 rounded-full gradient-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{pct}% of total</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Generate Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={type} onValueChange={v => { setType(v as ReportType); setReport(null); }}>
                <SelectTrigger><SelectValue placeholder="Select report" /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="appointment">Appointment Summary Report</SelectItem>
                  <SelectItem value="patient">Patient Summary Report</SelectItem>
                  <SelectItem value="dentist">Dentist Performance Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={generate}>
              <Search className="w-4 h-4 mr-2" /> Generate Report
            </Button>
            {report && <Button variant="outline" onClick={() => setReport(null)}>Clear Preview</Button>}
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="font-heading text-lg">{reportMeta[report.type].title}</CardTitle>
            <p className="text-xs text-muted-foreground">Ayag Dental Clinic · Generated: {report.generatedAt}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {reportMeta[report.type].columns.map(c => <TableHead key={c}>{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={reportMeta[report.type].columns.length} className="text-center text-muted-foreground py-8">
                        No records found.
                      </TableCell>
                    </TableRow>
                  ) : report.rows.map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className={report.type === "appointment" && j === 5 ? `font-medium ${statusColor[cell] ?? ""}` : ""}>
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
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
