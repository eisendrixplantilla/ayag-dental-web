import { useCallback, useEffect, useMemo, useState } from "react";
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
import { toast } from "@/hooks/use-toast";
import { FilePlus2, FileEdit, Eye, Loader2, Plus, X, Printer } from "lucide-react";
import {
  getDentalRecords, getDentalRecord, createDentalRecord, updateDentalRecord,
  type DentalRecord, type TreatmentInput, type PrescriptionInput,
} from "@/lib/api/dentalRecords";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { formatManilaDate, manilaTodayDateStr } from "@/lib/formatDate";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";

const emptyForm = {
  appointmentId: "",
  date: manilaTodayDateStr(),
  diagnosis: "",
  toothNumber: "",
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

  const load = () => {
    setLoading(true);
    getDentalRecords()
      .then(setRecords)
      .catch(() => toast({ title: "Failed to load dental records", variant: "destructive" }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => {
    getAppointments().then(setAppointments).catch(() => {});
  }, []);

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Dental Records",
      columns: ["Date", "Patient", "Procedures", "Tooth No.", "Diagnosis", "Prescriptions"],
      rows: records.map(r => [
        format(parseISO(r.date), "MMM d, yyyy"),
        r.patientName ?? "—",
        r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—",
        r.toothNumber || "—",
        r.diagnosis,
        r.prescriptions.map(p => p.medicine).join(", ") || "—",
      ]),
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
  const [editForm, setEditForm] = useState({ diagnosis: "", toothNumber: "", treatmentNotes: "", nextVisit: "" });
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
      treatmentNotes: r.treatmentNotes ?? "",
      nextVisit: r.nextVisit ?? "",
    });
    setEditTreatments(r.treatments.map(t => ({ serviceName: t.serviceName ?? "" })));
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
        toothNumber: editForm.toothNumber.trim() || undefined,
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
            count={records.length}
            noun="record(s)"
            actions={
              <Button onClick={handlePrint} variant="outline" size="sm">
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            }
          />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Procedures</TableHead>
                <TableHead>Tooth No.</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Prescriptions</TableHead>
                <TableHead className="text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No dental records yet. Save a consultation or create a new record.
                  </TableCell>
                </TableRow>
              ) : (
                records.map(r => (
                  <TableRow
                    key={r.id}
                    ref={registerRow(r.id)}
                    className={highlightedKey === r.id ? HIGHLIGHT_ROW_CLASS : undefined}
                  >
                    <TableCell>{format(parseISO(r.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{r.patientName ?? "—"}</TableCell>
                    <TableCell>{r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell>{r.toothNumber || "—"}</TableCell>
                    <TableCell>{r.diagnosis}</TableCell>
                    <TableCell>{r.prescriptions.map(p => p.medicine).join(", ") || "—"}</TableCell>
                    <TableCell className="print:hidden">
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => openView(r)}>
                          <Eye className="w-4 h-4 mr-1" /> View
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          <FileEdit className="w-4 h-4 mr-1" /> Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* Create record */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
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
                <Input type="date" value={form.date} max={manilaTodayDateStr()} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <TreatmentListEditor treatments={treatments} setTreatments={setTreatments} />
            <div className="space-y-2">
              <Label>Tooth Number (if applicable)</Label>
              <Input value={form.toothNumber} onChange={e => setForm({ ...form, toothNumber: e.target.value })} placeholder="e.g. 36" />
            </div>
            <PrescriptionListEditor prescriptions={prescriptions} setPrescriptions={setPrescriptions} />
            <div className="space-y-2">
              <Label>Treatment Notes</Label>
              <Textarea value={form.treatmentNotes} onChange={e => setForm({ ...form, treatmentNotes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Appointment Recommendation (optional)</Label>
              <Input type="date" value={form.nextVisit} min={manilaTodayDateStr()} onChange={e => setForm({ ...form, nextVisit: e.target.value })} />
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
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Dental Record</DialogTitle>
            <DialogDescription>Update the diagnosis, procedures and prescriptions for this record.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={editForm.diagnosis} onChange={e => setEditForm({ ...editForm, diagnosis: e.target.value })} />
            </div>
            <TreatmentListEditor treatments={editTreatments} setTreatments={setEditTreatments} />
            <div className="space-y-2">
              <Label>Tooth Number</Label>
              <Input value={editForm.toothNumber} onChange={e => setEditForm({ ...editForm, toothNumber: e.target.value })} />
            </div>
            <PrescriptionListEditor prescriptions={editPrescriptions} setPrescriptions={setEditPrescriptions} />
            <div className="space-y-2">
              <Label>Treatment Notes</Label>
              <Textarea value={editForm.treatmentNotes} onChange={e => setEditForm({ ...editForm, treatmentNotes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Appointment Recommendation</Label>
              <Input type="date" value={editForm.nextVisit} onChange={e => setEditForm({ ...editForm, nextVisit: e.target.value })} />
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
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Dental Record Details</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              {viewLoading && <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Patient" value={viewTarget.patientName ?? "—"} />
                <Field label="Consultation Date" value={format(parseISO(viewTarget.date), "MMMM d, yyyy")} />
                <Field label="Tooth Number" value={viewTarget.toothNumber || "—"} />
                <Field label="Attending Dentist" value={viewTarget.dentistName ?? "—"} />
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TreatmentListEditor({ treatments, setTreatments }: { treatments: TreatmentInput[]; setTreatments: (t: TreatmentInput[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>Procedures Performed *</Label>
      {treatments.map((t, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={t.serviceName ?? ""}
            onChange={e => setTreatments(treatments.map((x, j) => j === i ? { serviceName: e.target.value } : x))}
            placeholder="e.g. Tooth Extraction"
          />
          {treatments.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => setTreatments(treatments.filter((_, j) => j !== i))}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setTreatments([...treatments, { serviceName: "" }])}>
        <Plus className="w-4 h-4 mr-1" /> Add Procedure
      </Button>
    </div>
  );
}

function PrescriptionListEditor({ prescriptions, setPrescriptions }: { prescriptions: PrescriptionInput[]; setPrescriptions: (p: PrescriptionInput[]) => void }) {
  return (
    <div className="space-y-2">
      <Label>Prescriptions</Label>
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
      <Button type="button" variant="outline" size="sm" onClick={() => setPrescriptions([...prescriptions, { medicine: "" }])}>
        <Plus className="w-4 h-4 mr-1" /> Add Prescription
      </Button>
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
