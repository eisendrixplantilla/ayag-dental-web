import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User, CalendarDays, FileText, Loader2 } from "lucide-react";
import { getPatient, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getPatient(id), getAppointments({ patientId: id })])
      .then(([p, a]) => {
        setPatient(p);
        setAppointments(a.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)));
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/admin/patients")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Patient Records
          </Button>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient History</h1>
          <p className="text-muted-foreground">Full clinical history for {patient.name}</p>
        </div>
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
          <Table>
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
              {appointments.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.date}</TableCell>
                  <TableCell>{a.time}</TableCell>
                  <TableCell>{a.service}</TableCell>
                  <TableCell>{a.dentistName ?? "—"}</TableCell>
                  <TableCell>{a.type === "walk-in" ? "Walk-in" : "Online"}</TableCell>
                  <TableCell><Badge variant="outline" className={statusClass(a.status)}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
              {appointments.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No appointments yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />Dental Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Dental records (diagnosis, procedures, prescriptions, and treatment notes) are recorded by the dentist during consultation and will appear here in a future update.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
