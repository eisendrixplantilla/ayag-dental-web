import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL } from "@/lib/tableClass";
import { ArrowLeft, User, CalendarDays, FileText, Loader2, Printer } from "lucide-react";
import { getPatient, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { toast } from "sonner";
import { formatManilaDate } from "@/lib/formatDate";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";

const statusClass = (s: string) =>
  s === "completed" || s === "confirmed"
    ? "bg-success/10 text-success border-success/20"
    : s === "cancelled" || s === "rejected"
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-warning/10 text-warning border-warning/20";

export default function AdminPatientHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const aptPages = usePagination(appointments);
  const recordPages = usePagination(records);
  const [loading, setLoading] = useState(true);
  const print = usePrintDocument();

  // The whole history as one document: who the patient is, then every visit and record.
  const handlePrint = () => {
    if (!patient) return;
    print({
      title: "Patient History",
      filters: [
        { label: "Patient", value: patient.name },
        { label: "Age", value: patient.age != null ? String(patient.age) : "—" },
        { label: "Gender", value: patient.gender ?? "—" },
        { label: "Contact Number", value: patient.phone ?? "—" },
        { label: "Email Address", value: patient.email },
        { label: "Address", value: patient.address ?? "—" },
        { label: "Blood Type", value: patient.bloodType ?? "—" },
        { label: "Allergies", value: patient.allergies ?? "—" },
        { label: "Account Status", value: patient.status },
      ],
      tables: [
        {
          heading: "Appointment History",
          columns: ["Date", "Time", "Service", "Dentist", "Type", "Status"],
          rows: appointments.map(a => [
            a.date,
            toLabel(toMinutes(a.time)),
            a.service,
            a.dentistName ?? "—",
            a.type === "walk-in" ? "Walk-in" : "Online",
            a.status,
          ]),
          emptyText: "No appointments yet.",
        },
        {
          heading: "Dental Records",
          columns: ["Date", "Procedures", "Diagnosis", "Dentist"],
          rows: records.map(r => [
            r.date,
            r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—",
            r.diagnosis,
            r.dentistName ?? "—",
          ]),
          emptyText: "No dental records yet.",
        },
      ],
    });
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getPatient(id), getAppointments({ patientId: id }), getDentalRecords({ patientId: id })])
      .then(([p, a, r]) => {
        setPatient(p);
        setAppointments(a.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)));
        setRecords(r);
      })
      .catch(() => toast.error("Failed to load patient history"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!patient) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/admin/patients")}>
          <ArrowLeft className="w-4 h-4 mr-2" />Back to Patient Records
        </Button>
        <p className="text-muted-foreground">Patient not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Patient History · {patient.name} · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 print:hidden" onClick={() => navigate("/admin/patients")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Patient Records
          </Button>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient History</h1>
          <p className="text-muted-foreground">Full clinical history for {patient.name}</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />Personal Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {[
              ["Full Name", patient.name],
              ["Age", patient.age != null ? String(patient.age) : "—"],
              ["Gender", patient.gender ?? "—"],
              ["Contact Number", patient.phone ?? "—"],
              ["Email Address", patient.email],
              ["Address", patient.address ?? "—"],
              ["Blood Type", patient.bloodType ?? "—"],
              ["Allergies", patient.allergies ?? "—"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="font-medium text-foreground">{value}</p>
              </div>
            ))}
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline" className={statusClass(patient.status === "active" ? "completed" : "cancelled")}>
                {patient.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />Appointment History ({appointments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aptPages.paged.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.date}</TableCell>
                  <TableCell>{toLabel(toMinutes(a.time))}</TableCell>
                  <TableCell className={WRAP_CELL}>{a.service}</TableCell>
                  <TableCell className={WRAP_CELL}>{a.dentistName ?? "—"}</TableCell>
                  <TableCell>{a.type === "walk-in" ? "Walk-in" : "Online"}</TableCell>
                  <TableCell><Badge variant="outline" className={statusClass(a.status)}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
              {appointments.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No appointments yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={aptPages.page} onPageChange={aptPages.setPage} total={appointments.length} pageSize={PAGE_SIZE} noun="appointment(s)" />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />Dental Records ({records.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Procedures</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Dentist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recordPages.paged.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell className={WRAP_CELL}>{r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"}</TableCell>
                  <TableCell className={WRAP_CELL}>{r.diagnosis}</TableCell>
                  <TableCell className={WRAP_CELL}>{r.dentistName ?? "—"}</TableCell>
                </TableRow>
              ))}
              {records.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No dental records yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={recordPages.page} onPageChange={recordPages.setPage} total={records.length} pageSize={PAGE_SIZE} noun="record(s)" />
        </CardContent>
      </Card>
    </div>
  );
}
