import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL } from "@/lib/tableClass";
import {
  User, CalendarDays, FileText, Stethoscope, Pill, Lock, Search, Check, ChevronsUpDown, Loader2, Printer,
} from "lucide-react";
import { getPatients, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, matchesReportFilter, type ReportFilter } from "@/lib/reportFilter";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { cn } from "@/lib/utils";
import { formatManilaDate } from "@/lib/formatDate";
import { formatTimeRange } from "@/lib/dentistSchedules";
import { useAuth } from "@/contexts/AuthContext";

const APT_COLUMNS = ["Date", "Time", "Service", "Type", "Status"];
const RECORD_COLUMNS = ["Date", "Procedures", "Diagnosis", "Treatment Notes"];
const PROCEDURE_COLUMNS = ["Date", "Procedure", "Dentist", "Outcome"];
const RX_COLUMNS = ["Date", "Medication", "Prescribed By"];

/** One section of the history: its own filter over its own rows. The four sections
 * differ only in what they hold, so they all narrow down the same way. */
function useSection<T>(items: T[], toRow: (item: T) => string[]) {
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const rows = useMemo(() => items.map(toRow), [items, toRow]);
  const shown = useMemo(
    () => items.map((item, i) => ({ item, row: rows[i] })).filter(({ row }) => matchesReportFilter(row, filter)),
    [items, rows, filter],
  );
  const visible = useMemo(() => shown.map(s => s.item), [shown]);
  const { page, setPage, paged } = usePagination(visible, filter);
  return { filter, setFilter, rows, shown, visible, paged, page, setPage };
}

/** How a section's filter reads on the printed document — nothing, when it isn't set. */
const printedFilter = (label: string, columns: string[], f: ReportFilter) =>
  filterIsActive(f) ? [{ label: `${label} filtered by`, value: describeReportFilter(columns, f) ?? "" }] : [];

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

  // Each section's text rows drive its filter, its count and its part of the printout
  // alike, so what is on screen and what is on paper can't drift apart.
  const aptSection = useSection(appointments, useCallback(
    (a: Appointment) => [a.date, formatTimeRange(a.time, a.endTime), a.service, a.type, a.status], []));
  const recordSection = useSection(records, useCallback(
    (r: DentalRecord) => [
      r.date,
      r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—",
      r.diagnosis,
      r.treatmentNotes || "—",
    ], []));
  const procedureSection = useSection(procedures, useCallback(
    (p: { date: string; procedure: string; dentist: string; outcome: string }) =>
      [p.date, p.procedure, p.dentist, p.outcome], []));
  const rxSection = useSection(prescriptions, useCallback(
    (p: { date: string; medication: string; dentist: string }) => [p.date, p.medication, p.dentist], []));

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
        ...printedFilter("Appointments", APT_COLUMNS, aptSection.filter),
        ...printedFilter("Dental records", RECORD_COLUMNS, recordSection.filter),
        ...printedFilter("Procedures", PROCEDURE_COLUMNS, procedureSection.filter),
        ...printedFilter("Prescriptions", RX_COLUMNS, rxSection.filter),
      ],
      tables: [
        {
          heading: "Appointment History",
          columns: APT_COLUMNS,
          rows: aptSection.shown.map(s => s.row),
          emptyText: "No appointments on record.",
        },
        {
          heading: "Dental Records",
          columns: RECORD_COLUMNS,
          rows: recordSection.shown.map(s => s.row),
          emptyText: "No dental records yet.",
        },
        {
          heading: "Procedures",
          columns: PROCEDURE_COLUMNS,
          rows: procedureSection.shown.map(s => s.row),
          emptyText: "No procedures on record.",
        },
        {
          heading: "Prescriptions",
          columns: RX_COLUMNS,
          rows: rxSection.shown.map(s => s.row),
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
            <CardHeader className="space-y-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-primary" />Appointment History
              </CardTitle>
              <TableToolbar
                columns={APT_COLUMNS}
                rows={aptSection.rows}
                filter={aptSection.filter}
                onChange={aptSection.setFilter}
                shown={aptSection.visible.length}
                noun="appointment(s)"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={COMPACT_TABLE}>
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
                  {aptSection.visible.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {appointments.length === 0 ? "No appointments on record." : "No appointments match this filter."}
                    </TableCell></TableRow>
                  ) : aptSection.paged.map(a => (
                    <TableRow key={a.id}>
                      <TableCell>{format(parseISO(a.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatTimeRange(a.time, a.endTime)}</TableCell>
                      <TableCell className={WRAP_CELL}>{a.service}</TableCell>
                      <TableCell className="capitalize">{a.type}</TableCell>
                      <TableCell><Badge variant="outline" className={statusClass(a.status)}>{a.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={aptSection.page} onPageChange={aptSection.setPage} total={aptSection.visible.length} pageSize={PAGE_SIZE} noun="appointment(s)" />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="space-y-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />Previous Dental Records
              </CardTitle>
              <TableToolbar
                columns={RECORD_COLUMNS}
                rows={recordSection.rows}
                filter={recordSection.filter}
                onChange={recordSection.setFilter}
                shown={recordSection.visible.length}
                noun="record(s)"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={COMPACT_TABLE}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Procedures</TableHead>
                    <TableHead>Diagnosis</TableHead>
                    <TableHead>Treatment Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordSection.visible.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {records.length === 0 ? "No dental records yet." : "No records match this filter."}
                    </TableCell></TableRow>
                  ) : recordSection.paged.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{format(parseISO(r.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className={WRAP_CELL}>{r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"}</TableCell>
                      <TableCell className={WRAP_CELL}>{r.diagnosis}</TableCell>
                      <TableCell className={WRAP_CELL}>{r.treatmentNotes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={recordSection.page} onPageChange={recordSection.setPage} total={recordSection.visible.length} pageSize={PAGE_SIZE} noun="record(s)" />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="space-y-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-primary" />Previous Procedures
              </CardTitle>
              <TableToolbar
                columns={PROCEDURE_COLUMNS}
                rows={procedureSection.rows}
                filter={procedureSection.filter}
                onChange={procedureSection.setFilter}
                shown={procedureSection.visible.length}
                noun="procedure(s)"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={COMPACT_TABLE}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Dentist</TableHead>
                    <TableHead>Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {procedureSection.visible.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {procedures.length === 0 ? "No procedures on record." : "No procedures match this filter."}
                    </TableCell></TableRow>
                  ) : procedureSection.paged.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{format(parseISO(p.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className={`font-medium ${WRAP_CELL}`}>{p.procedure}</TableCell>
                      <TableCell className={WRAP_CELL}>{p.dentist}</TableCell>
                      <TableCell className={WRAP_CELL}>{p.outcome}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={procedureSection.page} onPageChange={procedureSection.setPage} total={procedureSection.visible.length} pageSize={PAGE_SIZE} noun="procedure(s)" />
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="space-y-3">
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <Pill className="w-5 h-5 text-primary" />Previous Prescriptions
              </CardTitle>
              <TableToolbar
                columns={RX_COLUMNS}
                rows={rxSection.rows}
                filter={rxSection.filter}
                onChange={rxSection.setFilter}
                shown={rxSection.visible.length}
                noun="prescription(s)"
              />
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className={COMPACT_TABLE}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Medication</TableHead>
                    <TableHead>Prescribed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rxSection.visible.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      {prescriptions.length === 0 ? "No prescriptions on record." : "No prescriptions match this filter."}
                    </TableCell></TableRow>
                  ) : rxSection.paged.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{format(parseISO(p.date), "MMM d, yyyy")}</TableCell>
                      <TableCell className={`font-medium ${WRAP_CELL}`}>{p.medication}</TableCell>
                      <TableCell className={WRAP_CELL}>{p.dentist}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={rxSection.page} onPageChange={rxSection.setPage} total={rxSection.visible.length} pageSize={PAGE_SIZE} noun="prescription(s)" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
