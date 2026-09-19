import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  User, CalendarDays, FileText, Stethoscope, Pill, Lock, Search, Check, ChevronsUpDown, Loader2,
} from "lucide-react";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { cn } from "@/lib/utils";

const statusClass = (s: string) =>
  s === "completed" || s === "confirmed"
    ? "bg-success/10 text-success border-success/20"
    : s === "cancelled" || s === "rejected"
    ? "bg-destructive/10 text-destructive border-destructive/20"
    : "bg-warning/10 text-warning border-warning/20";

export default function DentistPatientHistory() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPatients().then(setPatients).catch(() => {});
  }, []);

  const selected = useMemo(() => patients.find(p => p.id === selectedId) ?? null, [patients, selectedId]);

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

  const procedures = useMemo(() => records.map(r => ({ date: r.date, procedure: r.procedure, dentist: r.dentistName ?? "—", outcome: "Completed" })), [records]);
  const prescriptions = useMemo(() => records.filter(r => r.prescription).map(r => ({ date: r.date, medication: r.prescription!, dentist: r.dentistName ?? "—" })), [records]);

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
                    {patients.map(p => (
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

      {!selected ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Select a patient to view their full history.
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
                      <TableCell>{r.service ?? "—"}</TableCell>
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
