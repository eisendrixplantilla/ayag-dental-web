import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  User, CalendarDays, FileText, Stethoscope, Pill, Lock, Search, Check, ChevronsUpDown, Loader2, Printer,
} from "lucide-react";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { cn } from "@/lib/utils";
import { formatManilaDate } from "@/lib/formatDate";
import { formatTimeRange } from "@/lib/dentistSchedules";
import { useAuth } from "@/contexts/AuthContext";

const statusClass = (s: string) =>
  s === "completed" || s === "confirmed"
    ? "bg-success/10 text-success border-success/20"
    : s === "cancelled" || s === "rejected"
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-warning/10 text-warning border-warning/20";

export default function DentistPatientHistory() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [myPatientIds, setMyPatientIds] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const print = usePrintDocument();

  useEffect(() => {
    Promise.all([getPatients(), getAppointments()])
      .then(([allPatients, allAppointments]) => {
        const mine = allAppointments.filter(a => !user?.name || a.dentistName === user.name);
        setPatients(allPatients);
        setMyPatientIds(new Set(mine.map(a => a.patientId).filter((id): id is string => !!id)));

        const mostRecent = [...mine].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
        if (mostRecent?.patientId) {
          setSelectedId(prev => prev || mostRecent.patientId!);
        }
      })
      .catch(() => {});
  }, [user?.name]);

  const myPatients = useMemo(() => patients.filter(p => myPatientIds.has(p.id)), [patients, myPatientIds]);

  const selected = useMemo(() => myPatients.find(p => p.id === selectedId) ?? null, [myPatients, selectedId]);

  useEffect(() => {
    if (!selectedId) { setAppointments([]); setRecords([]); return; }
    setLoading(true);
    Promise.all([getAppointments({ patientId: selectedId }), getDentalRecords({ patientId: selectedId })])
      .then(([a, r]) => {
        setAppointments(a.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)));
        setRecords(r);
      })
      .finally(() => setLoading(false));
  }, [selectedId]);

  const procedures = useMemo(
    () => records.flatMap(r => r.treatments.map(t => ({ date: r.date, procedure: t.serviceName ?? "—", dentist: r.dentistName ?? "—", outcome: "Completed" }))),
    [records],
  );
  const prescriptions = useMemo(
    () => records.flatMap(r => r.prescriptions.map(p => ({ date: r.date, medication: p.medicine, dentist: r.dentistName ?? "—" }))),
    [records],
  );

  // Everything on screen for the chosen patient, as one document.
  const handlePrint = () => {
    if (!selected) return;
    print({
      title: "Patient History",
      filters: [
        { label: "Patient", value: selected.name },
        { label: "Age", value: selected.age != null ? String(selected.age) : "—" },
        { label: "Gender", value: selected.gender ?? "—" },
        { label: "Contact Number", value: selected.phone ?? "—" },
        { label: "Email Address", value: selected.email },
        { label: "Address", value: selected.address ?? "—" },
        { label: "Blood Type", value: selected.bloodType ?? "—" },
        { label: "Allergies", value: selected.allergies ?? "—" },
      ],
      tables: [
        {
          heading: "Appointment History",
          columns: ["Date", "Time", "Service", "Type", "Status"],
          rows: appointments.map(a => [
            format(parseISO(a.date), "MMM d, yyyy"),
            formatTimeRange(a.time, a.endTime),
            a.service,
            a.type,
            a.status,
          ]),
          emptyText: "No appointments on record.",
        },
        {
          heading: "Dental Records",
          columns: ["Date", "Procedures", "Diagnosis", "Treatment Notes"],
          rows: records.map(r => [
            format(parseISO(r.date), "MMM d, yyyy"),
            r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—",
            r.diagnosis,
            r.treatmentNotes || "—",
          ]),
          emptyText: "No dental records yet.",
        },
        {
          heading: "Procedures",
          columns: ["Date", "Procedure", "Dentist", "Outcome"],
          rows: procedures.map(p => [
            format(parseISO(p.date), "MMM d, yyyy"), p.procedure, p.dentist, p.outcome,
          ]),
          emptyText: "No procedures on record.",
        },
        {
          heading: "Prescriptions",
          columns: ["Date", "Medication", "Prescribed By"],
          rows: prescriptions.map(p => [
            format(parseISO(p.date), "MMM d, yyyy"), p.medication, p.dentist,
          ]),
          emptyText: "No prescriptions on record.",
        },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Patient History{selected ? ` · ${selected.name}` : ""} · Generated {formatManilaDate()}</p>
        </div>
      </div>
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
        <div className="flex items-center gap-2 print:hidden">
          {selected && (
            <Button onClick={handlePrint} variant="outline">
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          )}
        <div className="w-full sm:w-72">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={pickerOpen}
                className="w-full justify-between font-normal"
              >
                <span className="flex items-center gap-2 truncate">
                  <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                  {selected?.name || "Search for a patient..."}
                </span>
                <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder="Search patients..." />
                <CommandList>
                  <CommandEmpty>No patients found.</CommandEmpty>
                  <CommandGroup>
                    {myPatients.map(p => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        onSelect={() => {
                          setSelectedId(p.id === selectedId ? "" : p.id);
                          setPickerOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 w-4 h-4", selectedId === p.id ? "opacity-100" : "opacity-0")} />
                        {p.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        </div>
      </div>

      {!selected ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            {myPatients.length === 0
              ? "You have no patients yet. Patients appear here automatically once you have an appointment with them."
              : "Select a patient to view their full history."}
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
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
                  ["Full Name", selected.name],
                  ["Age", selected.age != null ? String(selected.age) : "—"],
                  ["Gender", selected.gender ?? "—"],
                  ["Contact Number", selected.phone ?? "—"],
                  ["Email Address", selected.email],
                  ["Address", selected.address ?? "—"],
                  ["Blood Type", selected.bloodType ?? "—"],
                  ["Allergies", selected.allergies ?? "—"],
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
                  {appointments.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No appointments on record.</TableCell></TableRow>
                  ) : appointments.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{format(parseISO(a.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatTimeRange(a.time, a.endTime)}</TableCell>
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
                    <TableHead>Procedures</TableHead>
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
                      <TableCell>{r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"}</TableCell>
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
