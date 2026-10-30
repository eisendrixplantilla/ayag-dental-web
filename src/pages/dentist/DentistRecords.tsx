import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SERVICE_SEPARATOR } from "@/lib/services";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL, PIN_COL, CODE_COL } from "@/lib/tableClass";
import { toast } from "@/hooks/use-toast";
import { FilePlus2, FileEdit, Eye, Loader2, Plus, X, Printer } from "lucide-react";
import { IconAction, RowActions } from "@/components/RowActions";
import {
  getDentalRecords, getDentalRecord, createDentalRecord, updateDentalRecord,
  type DentalRecord, type TreatmentInput, type PrescriptionInput,
} from "@/lib/api/dentalRecords";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { formatManilaDate, manilaTodayDateStr } from "@/lib/formatDate";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import SortableHead from "@/components/SortableHead";
import { useTableSort } from "@/hooks/useTableSort";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, matchesReportFilter } from "@/lib/reportFilter";
import ToothChart, { type ProcedureTeeth } from "@/components/ToothChart";
import { teethAfter } from "@/lib/teeth";
import type { ToothCodes, ToothNotes } from "@/lib/toothCodes";
import { useProcedureColors } from "@/lib/procedureColors";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/DatePicker";
import { ConsentSection } from "@/components/Consent";

const COLUMNS = ["Date", "Patient", "Procedures", "Tooth No.", "Diagnosis", "Prescriptions"];

/** A procedure as the chart hands it back, as the form keeps it. */
const toInput = (p: ProcedureTeeth): TreatmentInput => ({ serviceName: p.serviceName ?? "", teeth: p.teeth ?? undefined });

const emptyForm = {
  appointmentId: "",
  date: manilaTodayDateStr(),
  diagnosis: "",
  toothNumber: "",
  toothCodes: {} as ToothCodes,
  toothNotes: {} as ToothNotes,
  treatmentNotes: "",
  nextVisit: "",
};

type FormState = typeof emptyForm;

export default function DentistRecords() {
  const { user } = useAuth();
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);

  const load = () => {
    setLoading(true);
    getDentalRecords()
      .then(setRecords)
      .catch(() => toast({ title: "Failed to load dental records", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    getAppointments().then(setAppointments).catch(() => {}).finally(() => setAppointmentsLoaded(true));
  }, []);

  const [filter, setFilter] = useState(EMPTY_FILTER);

  const rows = useMemo(
    () => records.map(r => [
      r.date,
      r.patientName ?? "—",
      r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—",
      r.toothNumber || "—",
      r.diagnosis,
      r.prescriptions.map(p => p.medicine).join(", ") || "—",
    ]),
    [records],
  );
  const matched = useMemo(
    () => records.map((record, i) => ({ record, row: rows[i] })).filter(({ row }) => matchesReportFilter(row, filter)),
    [records, rows, filter],
  );
  const { sorted: shown, sortKey, headProps } = useTableSort(matched, s => s.row);
  const visible = shown.map(s => s.record);
  const { page, setPage, paged } = usePagination(visible, [filter, sortKey]);

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Dental Records",
      columns: COLUMNS,
      rows: shown.map(s => s.row),
      filters: filterIsActive(filter)
        ? [{ label: "Filtered By", value: describeReportFilter(COLUMNS, filter) ?? "" }]
        : undefined,
    });

  const recordedAppointmentIds = useMemo(() => new Set(records.map(r => r.appointmentId)), [records]);
  const availableAppointments = useMemo(
    () => appointments
      .filter(a => !user?.name || a.dentistName === user.name)
      .filter(a => (a.status === "confirmed" || a.status === "completed") && !recordedAppointmentIds.has(a.id))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [appointments, user, recordedAppointmentIds],
  );

  // Arrived here from a notification bell click — the bell sends an appointment id,
  // so find the record saved against it and scroll to that row.
  const { highlightedKey, registerRow } = useNotificationJump(
    useCallback((id: string) => records.find(r => r.appointmentId === id)?.id, [records]),
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [treatments, setTreatments] = useState<TreatmentInput[]>([{ serviceName: "" }]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionInput[]>([]);

  const [editTarget, setEditTarget] = useState<DentalRecord | null>(null);
  const [editForm, setEditForm] = useState({ diagnosis: "", toothNumber: "", toothCodes: {} as ToothCodes, toothNotes: {} as ToothNotes, treatmentNotes: "", nextVisit: "" });
  const [editTreatments, setEditTreatments] = useState<TreatmentInput[]>([]);
  const [editPrescriptions, setEditPrescriptions] = useState<PrescriptionInput[]>([]);

  const [viewTarget, setViewTarget] = useState<DentalRecord | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const openCreate = () => {
    setForm(emptyForm);
    setTreatments([{ serviceName: "" }]);
    setPrescriptions([]);
    setCreateOpen(true);
  };

  // Sent here by the dashboard's "Write record": open the form on that consultation, dated
  // the day it took place, with its services as the procedures, once the records say it has
  // none yet.
  const location = useLocation();
  const navigate = useNavigate();
  const writeFor = (location.state as { writeFor?: unknown } | null)?.writeFor;
  useEffect(() => {
    if (typeof writeFor !== "string" || loading || !appointmentsLoaded) return;
    const apt = availableAppointments.find(a => a.id === writeFor);
    navigate(location.pathname, { replace: true, state: null });
    if (!apt) return;
    openCreate();
    setForm({ ...emptyForm, appointmentId: apt.id, date: apt.date });
    setTreatments(apt.service.split(SERVICE_SEPARATOR).map(s => ({ serviceName: s.trim() })).filter(t => t.serviceName));
    // Runs when the records have loaded with a consultation to write up; openCreate is the page's own.
  }, [writeFor, loading, appointmentsLoaded, availableAppointments]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitCreate = async () => {
    const cleanTreatments = treatments.filter(t => t.serviceName?.trim());
    if (!form.appointmentId || !form.diagnosis.trim() || cleanTreatments.length === 0) {
      toast({ title: "Missing information", description: "Appointment, diagnosis and at least one procedure are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await createDentalRecord({
        appointmentId: form.appointmentId,
        date: form.date,
        diagnosis: form.diagnosis.trim(),
        toothNumber: form.toothNumber.trim() || undefined,
        toothCodes: form.toothCodes,
        toothNotes: form.toothNotes,
        treatmentNotes: form.treatmentNotes.trim() || undefined,
        nextVisit: form.nextVisit || undefined,
        treatments: cleanTreatments,
        prescriptions: prescriptions.filter(p => p.medicine?.trim()),
      });
      toast({ title: "Dental record saved", description: "The record now appears in the patient's Dental Records and Patient History." });
      setCreateOpen(false);
      load();
    } catch (err) {
      toast({ title: "Failed to save record", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (r: DentalRecord) => {
    setEditForm({
      diagnosis: r.diagnosis,
      toothNumber: r.toothNumber ?? "",
      toothCodes: r.toothCodes ?? {},
      toothNotes: r.toothNotes ?? {},
      treatmentNotes: r.treatmentNotes ?? "",
      nextVisit: r.nextVisit ?? "",
    });
    setEditTreatments(r.treatments.map(t => ({ serviceName: t.serviceName ?? "", teeth: t.teeth ?? undefined })));
    setEditPrescriptions(r.prescriptions.map(p => ({ medicine: p.medicine, dosage: p.dosage ?? "", instructions: p.instructions ?? "" })));
    setEditTarget(r);
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    const cleanTreatments = editTreatments.filter(t => t.serviceName?.trim());
    if (!editForm.diagnosis.trim() || cleanTreatments.length === 0) {
      toast({ title: "Missing information", description: "Diagnosis and at least one procedure are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateDentalRecord(editTarget.id, {
        diagnosis: editForm.diagnosis.trim(),
        toothNumber: editForm.toothNumber.trim(),
        toothCodes: editForm.toothCodes,
        toothNotes: editForm.toothNotes,
        treatmentNotes: editForm.treatmentNotes.trim() || undefined,
        nextVisit: editForm.nextVisit || undefined,
        treatments: cleanTreatments,
        prescriptions: editPrescriptions.filter(p => p.medicine?.trim()),
      });
      toast({ title: "Record updated" });
      setEditTarget(null);
      load();
    } catch (err) {
      toast({ title: "Failed to save changes", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openView = async (r: DentalRecord) => {
    setViewTarget(r);
    setViewLoading(true);
    try {
      const fresh = await getDentalRecord(r.id);
      setViewTarget(fresh);
    } catch {
      // fall back to the row data already shown
    } finally {
      setViewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Saved Dental Records · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dental Records</h1>
          <p className="text-muted-foreground">Create and review dental records from your consultations</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">

          <Button onClick={openCreate}>
            <FilePlus2 className="w-4 h-4 mr-1" /> New Dental Record
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="space-y-3">
          <CardTitle className="font-heading text-lg">Saved Dental Records</CardTitle>
          <TableToolbar
            columns={COLUMNS}
            rows={rows}
            filter={filter}
            onChange={setFilter}
            shown={visible.length}
            noun="record(s)"
            actions={
              <Button onClick={handlePrint} disabled={loading} variant="outline" size="sm">
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <SortableHead className={CODE_COL} {...headProps(0)}>Date</SortableHead>
                <SortableHead {...headProps(1)} className={PIN_COL}>Patient</SortableHead>
                <SortableHead {...headProps(2)}>Procedures</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(3)}>Tooth No.</SortableHead>
                <SortableHead {...headProps(4)}>Diagnosis</SortableHead>
                <SortableHead {...headProps(5)}>Prescriptions</SortableHead>
                <TableHead className={`print:hidden ${CODE_COL}`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No dental records yet. Save a consultation or create a new record.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map(r => (
                  <TableRow
                    key={r.id}
                    ref={registerRow(r.id)}
                    className={highlightedKey === r.id ? HIGHLIGHT_ROW_CLASS : undefined}
                  >
                    <TableCell className={CODE_COL}>{format(parseISO(r.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className={`font-medium ${WRAP_CELL} ${PIN_COL}`}>{r.patientName ?? "—"}</TableCell>
                    <TableCell className={WRAP_CELL}>{r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell className={CODE_COL}>{r.toothNumber || "—"}</TableCell>
                    <TableCell className={WRAP_CELL}>{r.diagnosis}</TableCell>
                    <TableCell className={WRAP_CELL}>{r.prescriptions.map(p => p.medicine).join(", ") || "—"}</TableCell>
                    <TableCell className={`print:hidden ${CODE_COL}`}>
                      <RowActions>
                        <IconAction label="View" icon={Eye} onClick={() => openView(r)} />
                        <IconAction label="Edit" icon={FileEdit} onClick={() => openEdit(r)} />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}
        <TablePagination
          page={page}
          onPageChange={setPage}
          total={visible.length}
          pageSize={PAGE_SIZE}
          noun="record(s)"
        />
        </CardContent>
      </Card>

      {/* Create record */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">New Dental Record</DialogTitle>
            <DialogDescription>Create a dental record for one of your appointments.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Appointment *</Label>
                <Select value={form.appointmentId} onValueChange={v => setForm({ ...form, appointmentId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select appointment" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {availableAppointments.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.patientName} — {format(parseISO(a.date), "MMM d, yyyy")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableAppointments.length === 0 && (
                  <p className="text-xs text-muted-foreground">No appointments available without a record yet.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Consultation Date *</Label>
                <DatePicker aria-label="Consultation date" value={form.date} max={manilaTodayDateStr()} required onChange={(v) => setForm({ ...form, date: v })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <TreatmentListEditor
              treatments={treatments}
              setTreatments={(next) => { setForm(f => ({ ...f, toothNumber: teethAfter(f.toothNumber, treatments, next) })); setTreatments(next); }}
            />
            <div className="space-y-2">
              <Label>Dental Chart (if applicable)</Label>
              <ToothChart
                procedures={treatments}
                value={form.toothNumber}
                codes={form.toothCodes}
                notes={form.toothNotes}
                onChange={(next) => {
                  setTreatments(next.procedures.map(toInput));
                  setForm(f => ({ ...f, toothNumber: next.value, toothCodes: next.codes, toothNotes: next.notes }));
                }}
                patientId={appointments.find(a => a.id === form.appointmentId)?.patientId}
              />
            </div>
            <PrescriptionListEditor prescriptions={prescriptions} setPrescriptions={setPrescriptions} />
            <div className="space-y-2">
              <Label>Treatment Notes</Label>
              <Textarea value={form.treatmentNotes} onChange={e => setForm({ ...form, treatmentNotes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Appointment Recommendation (optional)</Label>
              <DatePicker aria-label="Next appointment recommendation" value={form.nextVisit} min={manilaTodayDateStr()} onChange={(v) => setForm({ ...form, nextVisit: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit record */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-2xl bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Dental Record</DialogTitle>
            <DialogDescription>Update the diagnosis, procedures and prescriptions for this record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={editForm.diagnosis} onChange={e => setEditForm({ ...editForm, diagnosis: e.target.value })} />
            </div>
            <TreatmentListEditor
              treatments={editTreatments}
              setTreatments={(next) => { setEditForm(f => ({ ...f, toothNumber: teethAfter(f.toothNumber, editTreatments, next) })); setEditTreatments(next); }}
            />
            <div className="space-y-2">
              <Label>Dental Chart</Label>
              <ToothChart
                procedures={editTreatments}
                value={editForm.toothNumber}
                codes={editForm.toothCodes}
                notes={editForm.toothNotes}
                onChange={(next) => {
                  setEditTreatments(next.procedures.map(toInput));
                  setEditForm(f => ({ ...f, toothNumber: next.value, toothCodes: next.codes, toothNotes: next.notes }));
                }}
                patientId={editTarget?.patientId}
                excludeRecordId={editTarget?.id}
              />
            </div>
            <PrescriptionListEditor prescriptions={editPrescriptions} setPrescriptions={setEditPrescriptions} />
            <div className="space-y-2">
              <Label>Treatment Notes</Label>
              <Textarea value={editForm.treatmentNotes} onChange={e => setEditForm({ ...editForm, treatmentNotes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Appointment Recommendation</Label>
              <DatePicker aria-label="Next appointment recommendation" value={editForm.nextVisit} min={manilaTodayDateStr()} onChange={(v) => setEditForm({ ...editForm, nextVisit: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={submitEdit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View record */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-w-2xl bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Dental Record Details</DialogTitle>
            <DialogDescription className="sr-only">The record, its dental chart and the patient's consent.</DialogDescription>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              {viewLoading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Patient" value={viewTarget.patientName ?? "—"} />
                <Field label="Consultation Date" value={format(parseISO(viewTarget.date), "MMMM d, yyyy")} />
                <Field label="Tooth Number" value={viewTarget.toothNumber || "—"} />
                <Field label="Attending Dentist" value={viewTarget.dentistName ?? "—"} />
                <div className="col-span-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Dental Chart</p>
                  <ToothChart
                    procedures={viewTarget.treatments.map(t => ({ serviceName: t.serviceName ?? undefined, teeth: t.teeth }))}
                    value={viewTarget.toothNumber ?? ""}
                    codes={viewTarget.toothCodes ?? {}}
                    notes={viewTarget.toothNotes ?? {}}
                    patientId={viewTarget.patientId}
                    excludeRecordId={viewTarget.id}
                  />
                </div>
                <div className="col-span-2"><Field label="Diagnosis" value={viewTarget.diagnosis} /></div>
                <div className="col-span-2">
                  <Field label="Procedures Performed" value={viewTarget.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"} />
                </div>
                <div className="col-span-2"><Field label="Treatment Notes" value={viewTarget.treatmentNotes || "—"} /></div>
                <Field label="Next Visit" value={viewTarget.nextVisit ? format(parseISO(viewTarget.nextVisit), "MMMM d, yyyy") : "—"} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Prescriptions</p>
                {viewTarget.prescriptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prescriptions recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {viewTarget.prescriptions.map((p) => (
                      <div key={p.id} className="rounded-lg border border-border p-3 text-xs space-y-1">
                        <p className="font-medium text-foreground">{p.medicine}</p>
                        {p.dosage && <p className="text-muted-foreground">Dosage: {p.dosage}</p>}
                        {p.instructions && <p className="text-muted-foreground">Instructions: {p.instructions}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <ConsentSection appointmentId={viewTarget.appointmentId} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * The record's procedures as chips in one box; type the next one
 * and pick from the clinic's services as they match (arrow keys and Enter), or press Enter
 * to add what's typed.
 */
function TreatmentListEditor({ treatments, setTreatments }: { treatments: TreatmentInput[]; setTreatments: (t: TreatmentInput[]) => void }) {
  const { services } = useProcedureColors();
  const [draft, setDraft] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Moved through the list with the arrow keys: Enter then takes the highlighted service
  // even with nothing typed.
  const [navigated, setNavigated] = useState(false);
  const id = useId();
  const named = treatments.map((t, i) => ({ t, i })).filter(({ t }) => t.serviceName?.trim());
  const has = (name: string) => named.some(({ t }) => t.serviceName!.trim().toLowerCase() === name.trim().toLowerCase());
  // The services not on the record yet that match what's typed, best first: starting with it.
  const q = draft.trim().toLowerCase();
  const matches = services
    .filter(s => !has(s.name) && (!q || s.name.toLowerCase().includes(q)))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)));
  const add = (raw: string) => {
    const name = raw.trim();
    setDraft("");
    setActive(0);
    setNavigated(false);
    if (!name || has(name)) return;
    // Into the form's empty row when it has one, so the list never keeps a blank.
    const blank = treatments.findIndex(t => !t.serviceName?.trim());
    setTreatments(blank >= 0 ? treatments.map((t, j) => (j === blank ? { ...t, serviceName: name } : t)) : [...treatments, { serviceName: name }]);
  };
  const showList = listOpen && matches.length > 0;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-add`}>Procedures Performed *</Label>
      <div className="relative">
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          {named.map(({ t, i }) => (
            <span key={i} className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-muted/50 py-0.5 pl-2.5 pr-0.5 text-sm">
              <span className="truncate">{t.serviceName}</span>
              {t.teeth && <span className="text-xs tabular-nums text-muted-foreground">{t.teeth}</span>}
              <button type="button" aria-label={`Remove ${t.serviceName}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setTreatments(treatments.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <input
            id={`${id}-add`}
            role="combobox"
            aria-expanded={showList}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={showList ? `${id}-opt-${active}` : undefined}
            autoComplete="off"
            value={draft}
            onChange={e => { setDraft(e.target.value); setActive(0); setNavigated(false); setListOpen(true); }}
            onFocus={() => setListOpen(true)}
            onBlur={() => { setListOpen(false); add(draft); }}
            onKeyDown={e => {
              if (e.key === "ArrowDown" && matches.length) {
                e.preventDefault(); setListOpen(true); setNavigated(true); setActive(a => (navigated ? (a + 1) % matches.length : 0));
              } else if (e.key === "ArrowUp" && matches.length) {
                e.preventDefault(); setNavigated(true); setActive(a => (a - 1 + matches.length) % matches.length);
              } else if (e.key === "Enter" || e.key === ",") {
                e.preventDefault(); add(showList && (q || navigated) ? matches[active].name : draft);
              }
              else if (e.key === "Escape") setListOpen(false);
              else if (e.key === "Backspace" && !draft && named.length) setTreatments(treatments.filter((_, j) => j !== named[named.length - 1].i));
            }}
            placeholder={named.length ? "Add another…" : "e.g. Tooth Extraction"}
            className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {showList && (
          <ul id={`${id}-list`} role="listbox" aria-label="Services"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
            {matches.map((s, k) => (
              <li
                key={s.id}
                id={`${id}-opt-${k}`}
                role="option"
                aria-selected={k === active}
                // Picked before the box loses focus, so the blur doesn't add the half-typed text.
                onMouseDown={e => { e.preventDefault(); add(s.name); }}
                onMouseEnter={() => setActive(k)}
                className={cn("flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm", k === active && "bg-muted")}
              >
                <span className="truncate">{s.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Pick from the list or type one and press Enter.</p>
    </div>
  );
}

function PrescriptionListEditor({ prescriptions, setPrescriptions }: { prescriptions: PrescriptionInput[]; setPrescriptions: (p: PrescriptionInput[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Prescriptions</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => setPrescriptions([...prescriptions, { medicine: "" }])}>
          <Plus className="w-4 h-4 mr-1" /> Add Prescription
        </Button>
      </div>
      {prescriptions.length === 0 && <p className="text-xs text-muted-foreground">No prescriptions.</p>}
      {prescriptions.map((p, i) => (
        <div key={i} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex gap-2 items-start">
            <div className="flex-1 space-y-2">
              <Input
                value={p.medicine}
                onChange={e => setPrescriptions(prescriptions.map((x, j) => j === i ? { ...x, medicine: e.target.value } : x))}
                placeholder="Medicine"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={p.dosage ?? ""}
                  onChange={e => setPrescriptions(prescriptions.map((x, j) => j === i ? { ...x, dosage: e.target.value } : x))}
                  placeholder="Dosage"
                />
                <Input
                  value={p.instructions ?? ""}
                  onChange={e => setPrescriptions(prescriptions.map((x, j) => j === i ? { ...x, instructions: e.target.value } : x))}
                  placeholder="Instructions"
                />
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setPrescriptions(prescriptions.filter((_, j) => j !== i))}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
