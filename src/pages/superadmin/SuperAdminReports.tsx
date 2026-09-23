import { useEffect, useMemo, useState } from "react";
import { appointmentRef } from "@/lib/appointmentRef";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import StatCard from "@/components/StatCard";
import { BarChart3, CalendarDays, FileText, Printer, Search, Users, UserCog, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getStaff, type StaffMember } from "@/lib/api/staff";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { printReport } from "@/lib/printReport";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaDateTime } from "@/lib/formatDate";

type ReportType = "appointment" | "patient";

const reportMeta: Record<ReportType, { title: string; columns: string[] }> = {
  appointment: {
    title: "Appointment Summary Report",
    columns: ["Reference", "Patient Name", "Dentist", "Service", "Appointment Date", "Status"],
  },
  patient: {
    title: "Patient Summary Report",
    columns: ["Patient Information", "Total Appointments", "Latest Consultation"],
  },
};

const statusList = ["pending", "confirmed", "completed", "cancelled"] as const;

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getPatients(), getStaff(), getAppointments(), getDentalRecords()])
      .then(([p, s, a, r]) => {
        setPatients(p);
        setStaff(s);
        setAppointments(a);
        setRecords(r);
      })
      .catch(() => toast.error("Failed to load report data"))
      .finally(() => setLoading(false));
  }, []);

  const [type, setType] = useState<ReportType | "">("");
  // Applied to the generated report itself, so a long report can be narrowed without
  // running it again.
  const [rowFilter, setRowFilter] = useState("");
  /** "all", or the index of the column to search. */
  const [filterField, setFilterField] = useState("all");
  const [report, setReport] = useState<GeneratedReport | null>(null);

  const totalAppointments = appointments.length;
  const statusCounts = statusList.map((s) => ({
    label: statusMeta[s].label,
    count: appointments.filter((a) => a.status === s).length,
  }));

  const generate = () => {
    if (!type) {
      toast.error("Please select a report type first.");
      return;
    }

    let rows: string[][] = [];
    if (type === "appointment") {
      rows = [...appointments]
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        .map((a) => [appointmentRef(a.id), a.patientName, a.dentistName ?? "—", a.service, a.date, statusMeta[a.status]?.label ?? a.status]);
    } else {
      const latestOf = (rs: typeof records) => rs.length
        ? rs.reduce((max, r) => (r.date > max ? r.date : max), rs[0].date)
        : "No consultations yet";

      const accountRows = patients.map((p) => {
        const patientAppointments = appointments.filter((a) => a.patientId === p.id);
        const patientRecords = records.filter((r) => r.patientId === p.id);
        return [`${p.name} — ${p.email} · ${p.phone || "—"}`, String(patientAppointments.length), latestOf(patientRecords)];
      });

      // Walk-ins booked for someone with no account have no patients row to hang off,
      // so they'd be invisible here. Group those by the name taken at the desk, and
      // reach their records through the appointment rather than a patient id.
      const guests = new Map<string, Appointment[]>();
      for (const a of appointments.filter((a) => !a.patientId)) {
        const list = guests.get(a.patientName) ?? [];
        list.push(a);
        guests.set(a.patientName, list);
      }
      const guestRows = [...guests.entries()].map(([name, own]) => {
        const ids = new Set(own.map((a) => a.id));
        return [`${name} — No account (walk-in)`, String(own.length), latestOf(records.filter((r) => ids.has(r.appointmentId)))];
      });

      rows = [...accountRows, ...guestRows];
    }

    setRowFilter("");
    setFilterField("all");
    setReport({ type, rows, generatedAt: formatManilaDateTime() });
    toast.success("Report preview generated");
  };

  // The rows left after the on-screen filter: what is shown is what prints. "all"
  // searches every column; otherwise only the chosen one, so "Oral" can mean the
  // service and not a patient called Oral.
  const visibleRows = useMemo(() => {
    const q = rowFilter.trim().toLowerCase();
    if (!report) return [];
    if (!q) return report.rows;
    const col = filterField === "all" ? -1 : Number(filterField);
    return report.rows.filter((r) =>
      (col < 0 ? r.join(" ") : r[col] ?? "").toLowerCase().includes(q));
  }, [report, rowFilter, filterField]);

  // Both buttons print the same document — one to paper, one to a PDF.
  const sendToPrinter = (what: string) => {
    if (!report) return;
    const meta = reportMeta[report.type];
    const ok = printReport({
      title: meta.title,
      columns: meta.columns,
      rows: visibleRows,
      generatedAt: report.generatedAt,
      preparedBy: { name: user?.name ?? "—", role: roleLabel[user?.role ?? ""] ?? "Staff" },
      filters: rowFilter.trim()
        ? [{
            label: "Filtered By",
            value: filterField === "all"
              ? rowFilter.trim()
              : `${meta.columns[Number(filterField)]}: ${rowFilter.trim()}`,
          }]
        : undefined,
    });
    if (ok) toast.success(`${what} ready`);
    else toast.error(`Failed to prepare the ${what.toLowerCase()}`);
  };

  const handlePrint = () => sendToPrinter("Print preview");

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <h1 className="text-2xl font-bold font-heading text-foreground">Reports & Analytics</h1>
        <p className="text-muted-foreground">Appointment and patient reports</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 print:hidden"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
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
                      <p className={`font-bold text-xl mt-1 ${statusClassByLabel(item.label)}`}>{item.count}</p>
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
                {/* Narrows the report that was just generated, without running it again.
                    What is on screen is what gets printed. */}
                <div className="flex items-end justify-between gap-3 flex-wrap print:hidden">
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="w-full sm:w-44">
                      <Label className="text-xs text-muted-foreground">Filter by</Label>
                      <Select value={filterField} onValueChange={setFilterField}>
                        <SelectTrigger aria-label="Filter by field"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          <SelectItem value="all">All fields</SelectItem>
                          {reportMeta[report.type].columns.map((c, i) => (
                            <SelectItem key={c} value={String(i)}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        aria-label="Filter the generated report"
                        placeholder="Filter these results..."
                        value={rowFilter}
                        onChange={(e) => setRowFilter(e.target.value)}
                      />
                    </div>
                    {rowFilter.trim() && (
                      <Button variant="ghost" size="sm" onClick={() => setRowFilter("")}>Clear filter</Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {rowFilter.trim()
                        ? `${visibleRows.length} of ${report.rows.length} record(s)`
                        : `${report.rows.length} record(s)`}
                    </Badge>
                    <Button onClick={handlePrint}>
                      <Printer className="w-4 h-4 mr-2" /> Print Report
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {reportMeta[report.type].columns.map(c => <TableHead key={c}>{c}</TableHead>)}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={reportMeta[report.type].columns.length} className="text-center text-muted-foreground py-8">
                            {report.rows.length === 0 ? "No records found." : `No records match "${rowFilter.trim()}".`}
                          </TableCell>
                        </TableRow>
                      ) : visibleRows.map((row, i) => (
                        <TableRow key={i}>
                          {row.map((cell, j) => (
                            <TableCell key={j} className={report.type === "appointment" && j === 5 ? `font-medium ${statusClassByLabel(cell)}` : ""}>
                              {cell}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
