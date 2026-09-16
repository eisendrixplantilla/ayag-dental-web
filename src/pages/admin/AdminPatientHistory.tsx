import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, User, CalendarDays, FileText, Stethoscope, Pill, NotebookPen,
} from "lucide-react";

interface PatientProfile {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  address: string;
  bloodType: string;
  allergies: string;
  status: string;
}

const patientProfiles: Record<string, PatientProfile> = {
  P001: { id: "P001", name: "Maria Garcia", age: 32, gender: "Female", phone: "09123456789", email: "maria.garcia@email.com", address: "12 Rizal St., Tuguegarao City", bloodType: "O+", allergies: "Penicillin", status: "active" },
  P002: { id: "P002", name: "James Wilson", age: 45, gender: "Male", phone: "09234567890", email: "james.wilson@email.com", address: "45 Bonifacio Ave., Tuguegarao City", bloodType: "A+", allergies: "None", status: "active" },
  P003: { id: "P003", name: "Emma Davis", age: 28, gender: "Female", phone: "09345678901", email: "emma.davis@email.com", address: "8 Luna St., Tuguegarao City", bloodType: "B+", allergies: "Latex", status: "active" },
  P004: { id: "P004", name: "Robert Brown", age: 55, gender: "Male", phone: "09456789012", email: "robert.brown@email.com", address: "23 Mabini St., Tuguegarao City", bloodType: "AB+", allergies: "Ibuprofen", status: "inactive" },
  P005: { id: "P005", name: "Lisa Anderson", age: 38, gender: "Female", phone: "09567890123", email: "lisa.anderson@email.com", address: "77 Del Pilar St., Tuguegarao City", bloodType: "O-", allergies: "None", status: "active" },
};

const appointmentHistory = [
  { id: "A-1042", date: "2024-03-10", time: "9:00 AM", service: "Teeth Whitening", dentist: "Dr. Ayag", type: "Online", status: "completed" },
  { id: "A-0987", date: "2024-01-22", time: "1:30 PM", service: "Restoration", dentist: "Dr. Santos", type: "Walk-in", status: "completed" },
  { id: "A-0912", date: "2023-11-05", time: "10:00 AM", service: "EXO (Bunot)", dentist: "Dr. Reyes", type: "Online", status: "completed" },
  { id: "A-0854", date: "2023-08-14", time: "2:00 PM", service: "Oral Prophylaxis", dentist: "Dr. Ayag", type: "Walk-in", status: "cancelled" },
];

const dentalRecords = [
  { date: "2024-03-10", tooth: "11, 12, 21, 22", finding: "Extrinsic staining", diagnosis: "Discoloration", dentist: "Dr. Ayag" },
  { date: "2024-01-22", tooth: "36", finding: "Deep occlusal caries", diagnosis: "Dental caries", dentist: "Dr. Santos" },
  { date: "2023-11-05", tooth: "48", finding: "Impacted third molar", diagnosis: "Impaction", dentist: "Dr. Reyes" },
];

const procedures = [
  { date: "2024-03-10", procedure: "In-office teeth whitening", tooth: "Anterior teeth", dentist: "Dr. Ayag", outcome: "Completed" },
  { date: "2024-01-22", procedure: "Composite restoration", tooth: "36", dentist: "Dr. Santos", outcome: "Completed" },
  { date: "2023-11-05", procedure: "Surgical extraction", tooth: "48", dentist: "Dr. Reyes", outcome: "Completed" },
];

const prescriptions = [
  { date: "2024-01-22", medication: "Mefenamic Acid 500mg", dosage: "1 cap every 8 hrs", duration: "3 days", dentist: "Dr. Santos" },
  { date: "2023-11-05", medication: "Amoxicillin 500mg", dosage: "1 cap every 8 hrs", duration: "7 days", dentist: "Dr. Reyes" },
  { date: "2023-11-05", medication: "Ibuprofen 400mg", dosage: "1 tab every 6 hrs as needed", duration: "3 days", dentist: "Dr. Reyes" },
];

const treatmentNotes = [
  { date: "2024-03-10", dentist: "Dr. Ayag", note: "Whitening completed with minimal sensitivity. Advised to avoid staining food and drinks for 48 hours." },
  { date: "2024-01-22", dentist: "Dr. Santos", note: "Caries removed and restored with composite. Occlusion checked and adjusted. Recall in 6 months." },
  { date: "2023-11-05", dentist: "Dr. Reyes", note: "Surgical extraction of impacted 48 under local anesthesia. Sutures placed, removal after 7 days." },
];

const byDateDesc = <T extends { date: string }>(rows: T[]) =>
  [...rows].sort((a, b) => b.date.localeCompare(a.date));

const statusClass = (s: string) =>
  s === "completed"
    ? "bg-success/10 text-success border-success/20"
    : s === "cancelled" || s === "rejected"
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-warning/10 text-warning border-warning/20";

export default function AdminPatientHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const patient = patientProfiles[id ?? ""] ?? patientProfiles.P001;

  const appointments = useMemo(() => byDateDesc(appointmentHistory), []);
  const records = useMemo(() => byDateDesc(dentalRecords), []);
  const procs = useMemo(() => byDateDesc(procedures), []);
  const meds = useMemo(() => byDateDesc(prescriptions), []);
  const notes = useMemo(() => byDateDesc(treatmentNotes), []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/admin/patients")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back to Patient Records
          </Button>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient History</h1>
          <p className="text-muted-foreground">
            Full clinical history for {patient.name} ({patient.id})
          </p>
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
              ["Patient ID", patient.id],
              ["Full Name", patient.name],
              ["Age", String(patient.age)],
              ["Gender", patient.gender],
              ["Contact Number", patient.phone],
              ["Email Address", patient.email],
              ["Address", patient.address],
              ["Blood Type", patient.bloodType],
              ["Allergies", patient.allergies],
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
            <CalendarDays className="w-5 h-5 text-primary" />Appointment History
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
                  <TableCell>{a.dentist}</TableCell>
                  <TableCell>{a.type}</TableCell>
                  <TableCell><Badge variant="outline" className={statusClass(a.status)}>{a.status}</Badge></TableCell>
                </TableRow>
              ))}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Tooth / Area</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Dentist</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.date}</TableCell>
                  <TableCell>{r.tooth}</TableCell>
                  <TableCell>{r.finding}</TableCell>
                  <TableCell>{r.diagnosis}</TableCell>
                  <TableCell>{r.dentist}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />Procedures Performed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Tooth / Area</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {procs.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.date}</TableCell>
                  <TableCell className="font-medium">{p.procedure}</TableCell>
                  <TableCell>{p.tooth}</TableCell>
                  <TableCell>{p.dentist}</TableCell>
                  <TableCell>{p.outcome}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Pill className="w-5 h-5 text-primary" />Prescriptions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Medication</TableHead>
                <TableHead>Dosage</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Prescribed By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meds.map((m, i) => (
                <TableRow key={i}>
                  <TableCell>{m.date}</TableCell>
                  <TableCell className="font-medium">{m.medication}</TableCell>
                  <TableCell>{m.dosage}</TableCell>
                  <TableCell>{m.duration}</TableCell>
                  <TableCell>{m.dentist}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <NotebookPen className="w-5 h-5 text-primary" />Treatment Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {notes.map((n, i) => (
            <div key={i} className="border-l-2 border-primary/40 pl-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{n.date}</span>
                <span className="text-muted-foreground">• {n.dentist}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{n.note}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
