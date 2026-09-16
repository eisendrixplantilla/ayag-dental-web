import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { FilePlus2, FileEdit, History, Eye } from "lucide-react";
import {
  useDentistAppointments, useDentalRecords, createDentalRecord, correctDentalRecord,
  type DentalRecord,
} from "@/lib/dentistAppointmentStore";

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  patient: "",
  diagnosis: "",
  procedure: "",
  toothNumber: "",
  prescription: "",
  treatmentNotes: "",
  nextVisit: "",
};

export default function DentistRecords() {
  const { user } = useAuth();
  const appointments = useDentistAppointments();
  const records = useDentalRecords();

  const patients = useMemo(() => {
    const names = new Map<string, string>();
    appointments.forEach(a => names.set(a.patient, a.service));
    return [...names.keys()];
  }, [appointments]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [service, setService] = useState("General Consultation");

  const [editTarget, setEditTarget] = useState<DentalRecord | null>(null);
  const [editForm, setEditForm] = useState({ diagnosis: "", procedure: "", toothNumber: "", prescription: "", treatmentNotes: "", nextVisit: "" });
  const [editReason, setEditReason] = useState("");

  const [viewTarget, setViewTarget] = useState<DentalRecord | null>(null);

  const openCreate = () => {
    setForm(emptyForm);
    setService("General Consultation");
    setCreateOpen(true);
  };

  const submitCreate = () => {
    if (!form.date || !form.patient || !form.diagnosis.trim() || !form.procedure.trim()) {
      toast({ title: "Missing information", description: "Consultation date, patient, diagnosis and procedure are required.", variant: "destructive" });
      return;
    }
    createDentalRecord({
      patient: form.patient,
      dentist: user?.name ?? "Dentist",
      date: form.date,
      service,
      diagnosis: form.diagnosis.trim(),
      procedure: form.procedure.trim(),
      toothNumber: form.toothNumber.trim() || undefined,
      prescription: form.prescription.trim(),
      treatmentNotes: form.treatmentNotes.trim(),
      nextVisit: form.nextVisit || undefined,
    });
    toast({ title: "Dental record saved", description: "The record now appears in the patient's Dental Records and Patient History." });
    setCreateOpen(false);
  };

  const openEdit = (r: DentalRecord) => {
    setEditForm({
      diagnosis: r.diagnosis,
      procedure: r.procedure,
      toothNumber: r.toothNumber ?? "",
      prescription: r.prescription,
      treatmentNotes: r.treatmentNotes,
      nextVisit: r.nextVisit ?? "",
    });
    setEditReason("");
    setEditTarget(r);
  };

  const submitEdit = () => {
    if (!editTarget) return;
    if (!editReason.trim()) {
      toast({ title: "Correction reason required", description: "A reason is required for audit purposes.", variant: "destructive" });
      return;
    }
    if (!editForm.diagnosis.trim() || !editForm.procedure.trim()) {
      toast({ title: "Missing information", description: "Diagnosis and procedure are required.", variant: "destructive" });
      return;
    }
    correctDentalRecord(
      editTarget.id,
      {
        diagnosis: editForm.diagnosis.trim(),
        procedure: editForm.procedure.trim(),
        toothNumber: editForm.toothNumber.trim() || undefined,
        prescription: editForm.prescription.trim(),
        treatmentNotes: editForm.treatmentNotes.trim(),
        nextVisit: editForm.nextVisit || undefined,
      },
      editReason.trim(),
    );
    toast({ title: "Record corrected", description: "The correction was saved with an audit trail entry." });
    setEditTarget(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dental Records</h1>
          <p className="text-muted-foreground">Create and review dental records from your consultations</p>
        </div>
        <Button onClick={openCreate}>
          <FilePlus2 className="w-4 h-4 mr-1" /> New Dental Record
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Saved Dental Records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Procedure</TableHead>
                <TableHead>Tooth No.</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Prescription</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    No dental records yet. Save a consultation or create a new record.
                  </TableCell>
                </TableRow>
              ) : (
                records.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{format(parseISO(r.date), "MMM d, yyyy")}</TableCell>
                    <TableCell className="font-medium">{r.patient}</TableCell>
                    <TableCell>{r.service}</TableCell>
                    <TableCell>{r.procedure}</TableCell>
                    <TableCell>{r.toothNumber || "—"}</TableCell>
                    <TableCell>{r.diagnosis}</TableCell>
                    <TableCell>{r.prescription || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => setViewTarget(r)}>
                          <Eye className="w-4 h-4 mr-1" /> View
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                          <FileEdit className="w-4 h-4 mr-1" /> Correct
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-4">
            Dental records cannot be deleted to preserve medical record integrity. Corrections are saved with an audit trail.
          </p>
        </CardContent>
      </Card>

      {/* Create record */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">New Dental Record</DialogTitle>
            <DialogDescription>Create a dental record after a consultation. Saved records cannot be deleted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Consultation Date *</Label>
                <Input type="date" value={form.date} max={new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Patient Name *</Label>
                <Select value={form.patient} onValueChange={v => {
                  const apt = appointments.find(a => a.patient === v);
                  setForm({ ...form, patient: v });
                  if (apt) setService(apt.service);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {patients.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Procedure Performed *</Label>
                <Input value={form.procedure} onChange={e => setForm({ ...form, procedure: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tooth Number (if applicable)</Label>
                <Input value={form.toothNumber} onChange={e => setForm({ ...form, toothNumber: e.target.value })} placeholder="e.g. 36" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prescription</Label>
              <Textarea value={form.prescription} onChange={e => setForm({ ...form, prescription: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Treatment Notes</Label>
              <Textarea value={form.treatmentNotes} onChange={e => setForm({ ...form, treatmentNotes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Appointment Recommendation (optional)</Label>
              <Input type="date" value={form.nextVisit} min={new Date().toISOString().split("T")[0]} onChange={e => setForm({ ...form, nextVisit: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate}>Save Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restricted correction */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Correct Dental Record</DialogTitle>
            <DialogDescription>
              Corrections are restricted: a reason is required and every change is recorded in the audit trail. The original values are never deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for Correction *</Label>
              <Textarea value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="e.g. Typographical error in diagnosis" />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={editForm.diagnosis} onChange={e => setEditForm({ ...editForm, diagnosis: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Procedure Performed *</Label>
                <Input value={editForm.procedure} onChange={e => setEditForm({ ...editForm, procedure: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tooth Number</Label>
                <Input value={editForm.toothNumber} onChange={e => setEditForm({ ...editForm, toothNumber: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prescription</Label>
              <Textarea value={editForm.prescription} onChange={e => setEditForm({ ...editForm, prescription: e.target.value })} />
            </div>
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
            <Button onClick={submitEdit}>Save Correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View record + audit trail */}
      <Dialog open={!!viewTarget} onOpenChange={(o) => !o && setViewTarget(null)}>
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Dental Record Details</DialogTitle>
          </DialogHeader>
          {viewTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Patient" value={viewTarget.patient} />
                <Field label="Consultation Date" value={format(parseISO(viewTarget.date), "MMMM d, yyyy")} />
                <Field label="Service" value={viewTarget.service} />
                <Field label="Tooth Number" value={viewTarget.toothNumber || "—"} />
                <Field label="Diagnosis" value={viewTarget.diagnosis} />
                <Field label="Procedure Performed" value={viewTarget.procedure} />
                <div className="col-span-2"><Field label="Prescription" value={viewTarget.prescription || "—"} /></div>
                <div className="col-span-2"><Field label="Treatment Notes" value={viewTarget.treatmentNotes || "—"} /></div>
                <Field label="Next Visit" value={viewTarget.nextVisit ? format(parseISO(viewTarget.nextVisit), "MMMM d, yyyy") : "—"} />
                <Field label="Attending Dentist" value={viewTarget.dentist} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
                  <History className="w-3.5 h-3.5" /> Audit Trail
                </p>
                {(viewTarget.audit?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No corrections have been made to this record.</p>
                ) : (
                  <div className="space-y-2">
                    {viewTarget.audit!.map((a, i) => (
                      <div key={i} className="rounded-lg border border-border p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Corrected</Badge>
                          <span className="text-muted-foreground">{format(parseISO(a.editedAt), "MMM d, yyyy h:mm a")}</span>
                        </div>
                        <p><span className="font-medium">Reason:</span> {a.reason}</p>
                        <p className="text-muted-foreground"><span className="font-medium text-foreground">Changes:</span> {a.changes}</p>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
