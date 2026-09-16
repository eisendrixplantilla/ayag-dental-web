import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  User, CalendarDays, FileText, Stethoscope, Pill, NotebookPen, Lock,
} from "lucide-react";
import {
  useDentistAppointments, useDentalRecords,
} from "@/lib/dentistAppointmentStore";

interface PatientProfile {
  name: string;
  contact: string;
  email: string;
  age: number;
  gender: string;
  address: string;
  bloodType: string;
  allergies: string;
}

const extraProfiles: Record<string, Partial<PatientProfile>> = {
  "Maria Garcia": { age: 32, gender: "Female", address: "12 Rizal St., Tuguegarao City", bloodType: "O+", allergies: "Penicillin" },
  "James Wilson": { age: 45, gender: "Male", address: "45 Bonifacio Ave., Tuguegarao City", bloodType: "A+", allergies: "None" },
  "Emma Davis": { age: 28, gender: "Female", address: "8 Luna St., Tuguegarao City", bloodType: "B+", allergies: "Latex" },
  "Carlo Reyes": { age: 36, gender: "Male", address: "21 Gomez St., Tuguegarao City", bloodType: "O+", allergies: "None" },
  "Ana Santos": { age: 29, gender: "Female", address: "63 Burgos St., Tuguegarao City", bloodType: "B-", allergies: "None" },
  "Juan Dela Cruz": { age: 41, gender: "Male", address: "9 Paco St., Tuguegarao City", bloodType: "A-", allergies: "Aspirin" },
  "Pedro Reyes": { age: 50, gender: "Male", address: "33 Luna St., Tuguegarao City", bloodType: "AB+", allergies: "None" },
};

const statusClass = (s: string) =>
  s === "completed"
    ? "bg-success/10 text-success border-success/20"
    : s === "cancelled" || s === "rejected"
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-warning/10 text-warning border-warning/20";

const byDateDesc = <T extends { date: string }>(rows: T[]) =>
  [...rows].sort((a, b) => b.date.localeCompare(a.date));

export default function DentistPatientHistory() {
  const appointments = useDentistAppointments();
  const dentalRecords = useDentalRecords();
  const [selected, setSelected] = useState<string>("");

  const patientNames = useMemo(
    () => Array.from(new Set(appointments.map(a => a.patient))),
    [appointments],
  );

  const profile: PatientProfile | null = useMemo(() => {
    if (!selected) return null;
    const apt = appointments.find(a => a.patient === selected);
    const extra = extraProfiles[selected] ?? {};
    return {
      name: selected,
      contact: apt?.contact ?? "—",
      email: apt?.email ?? "—",
      age: extra.age ?? 0,
      gender: extra.gender ?? "—",
      address: extra.address ?? "—",
      bloodType: extra.bloodType ?? "—",
      allergies: extra.allergies ?? "—",
    };
  }, [selected, appointments]);

  const history = useMemo(() => byDateDesc(appointments.filter(a => a.patient === selected)), [appointments, selected]);
  const records = useMemo(() => byDateDesc(dentalRecords.filter(r => r.patient === selected)), [dentalRecords, selected]);
  const procedures = useMemo(() => records.map(r => ({ date: r.date, procedure: r.procedure, dentist: r.dentist, outcome: "Completed" })), [records]);
  const prescriptions = useMemo(() => records.filter(r => r.prescription).map(r => ({ date: r.date, medication: r.prescription, dentist: r.dentist })), [records]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient History</h1>
          <p className="text-muted-foreground flex items-center gap-2">
            Full clinical history of your patients
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Lock className="w-3 h-3" />View only
            </Badge>
          </p>
        </div>
        <div className="w-full sm:w-64">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="Select a patient" />
            </SelectTrigger>
            <SelectContent>
              {patientNames.map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!profile ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Select a patient to view their full history.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                {[
                  ["Full Name", profile.name],
                  ["Age", profile.age ? String(profile.age) : "—"],
                  ["Gender", profile.gender],
                  ["Contact Number", profile.contact],
                  ["Email Address", profile.email],
                  ["Address", profile.address],
                  ["Blood Type", profile.bloodType],
                  ["Allergies", profile.allergies],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />Appointment History
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No appointments on record.</TableCell></TableRow>
                  ) : history.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{format(parseISO(a.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>{a.time}</TableCell>
                      <TableCell>{a.service}</TableCell>
                      <TableCell className="capitalize">{a.type}</TableCell>
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
                <FileText className="w-5 h-5 text-primary" />Previous Dental Records
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Treatment Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No dental records yet.</TableCell></TableRow>
                  ) : records.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{format(parseISO(r.date), "MMM d, yyyy")}</TableCell>
                      <TableCell>{r.service}</TableCell>
                      <TableCell>{r.diagnosis}</TableCell>
                      <TableCell>{r.treatmentNotes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-primary" />Previous Procedures
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Dentist</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procedures.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No procedures on record.</TableCell></TableRow>
                  ) : procedures.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{format(parseISO(p.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-medium">{p.procedure}</TableCell>
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
                <Pill className="w-5 h-5 text-primary" />Previous Prescriptions
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Medication</TableHead>
                    <TableHead>Prescribed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescriptions.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No prescriptions on record.</TableCell></TableRow>
                  ) : prescriptions.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{format(parseISO(p.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="font-medium">{p.medication}</TableCell>
                      <TableCell>{p.dentist}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
