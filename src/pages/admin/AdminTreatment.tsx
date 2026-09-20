import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, Pill, CalendarPlus, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getDentalRecords, createDentalRecord,
  type DentalRecord, type TreatmentInput, type PrescriptionInput,
} from "@/lib/api/dentalRecords";
import { getAppointments, type Appointment } from "@/lib/api/appointments";

export default function AdminTreatment() {
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getDentalRecords(), getAppointments()])
      .then(([r, a]) => { setRecords(r); setAppointments(a); })
      .catch(() => toast.error("Failed to load treatment data"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const recordedAppointmentIds = useMemo(() => new Set(records.map(r => r.appointmentId)), [records]);
  const availableAppointments = useMemo(
    () => appointments
      .filter(a => (a.status === "confirmed" || a.status === "completed") && !recordedAppointmentIds.has(a.id))
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    [appointments, recordedAppointmentIds],
  );

  const [appointmentId, setAppointmentId] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [toothNumber, setToothNumber] = useState("");
  const [treatmentNotes, setTreatmentNotes] = useState("");
  const [nextVisit, setNextVisit] = useState("");
  const [treatments, setTreatments] = useState<TreatmentInput[]>([{ serviceName: "" }]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionInput[]>([]);

  const resetForm = () => {
    setAppointmentId("");
    setDiagnosis("");
    setToothNumber("");
    setTreatmentNotes("");
    setNextVisit("");
    setTreatments([{ serviceName: "" }]);
    setPrescriptions([]);
  };

  const save = async () => {
    const cleanTreatments = treatments.filter(t => t.serviceName?.trim());
    if (!appointmentId || !diagnosis.trim() || cleanTreatments.length === 0) {
      toast.error("Appointment, diagnosis and at least one procedure are required.");
      return;
    }
    setSaving(true);
    try {
      await createDentalRecord({
        appointmentId,
        diagnosis: diagnosis.trim(),
        toothNumber: toothNumber.trim() || undefined,
        treatmentNotes: treatmentNotes.trim() || undefined,
        nextVisit: nextVisit || undefined,
        treatments: cleanTreatments,
        prescriptions: prescriptions.filter(p => p.medicine?.trim()),
      });
      toast.success("Treatment record saved");
      resetForm();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save treatment record");
    } finally {
      setSaving(false);
    }
  };

  const selectedAppointment = appointments.find(a => a.id === appointmentId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Treatment Recording</h1>
        <p className="text-muted-foreground">Record procedures, prescriptions, and follow-ups</p>
      </div>

      <div className="space-y-2">
        <Label>Appointment *</Label>
        <Select value={appointmentId} onValueChange={setAppointmentId}>
          <SelectTrigger><SelectValue placeholder="Select an appointment without a record yet" /></SelectTrigger>
          <SelectContent className="bg-popover">
            {availableAppointments.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.patientName} — {format(parseISO(a.date), "MMM d, yyyy")} · {a.dentistName ?? "Unassigned"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {availableAppointments.length === 0 && (
          <p className="text-xs text-muted-foreground">No confirmed or completed appointments are waiting for a record.</p>
        )}
      </div>

      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record" className="gap-1"><ClipboardList className="w-4 h-4" /> Record Procedure</TabsTrigger>
          <TabsTrigger value="prescription" className="gap-1"><Pill className="w-4 h-4" /> Prescription</TabsTrigger>
          <TabsTrigger value="followup" className="gap-1"><CalendarPlus className="w-4 h-4" /> Follow-up</TabsTrigger>
        </TabsList>

        <TabsContent value="record">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Patient</Label><Input value={selectedAppointment?.patientName ?? ""} disabled placeholder="Select an appointment above" /></div>
                <div><Label>Tooth Number</Label><Input value={toothNumber} onChange={e => setToothNumber(e.target.value)} placeholder="e.g., #14, Full Mouth" /></div>
              </div>
              <div><Label>Diagnosis *</Label><Textarea value={diagnosis} onChange={e => setDiagnosis(e.target.value)} rows={2} placeholder="Findings and diagnosis..." /></div>
              <TreatmentListEditor treatments={treatments} setTreatments={setTreatments} />
              <div><Label>Treatment Notes</Label><Textarea value={treatmentNotes} onChange={e => setTreatmentNotes(e.target.value)} rows={3} placeholder="Treatment notes and observations..." /></div>
              <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Treatment Record
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prescription">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              <div><Label>Patient</Label><Input value={selectedAppointment?.patientName ?? ""} disabled placeholder="Select an appointment above" /></div>
              <PrescriptionListEditor prescriptions={prescriptions} setPrescriptions={setPrescriptions} />
              <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Treatment Record
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              <div><Label>Patient</Label><Input value={selectedAppointment?.patientName ?? ""} disabled placeholder="Select an appointment above" /></div>
              <div className="max-w-xs">
                <Label>Next Visit Date</Label>
                <Input type="date" value={nextVisit} min={new Date().toISOString().split("T")[0]} onChange={e => setNextVisit(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">This is saved on the treatment record as the recommended next visit. It does not automatically book an appointment — use Appointments to schedule it.</p>
              <Button className="gradient-primary text-primary-foreground" onClick={save} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Treatment Record
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Recent Treatments</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
          <div className="space-y-3">
            {records.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">{r.patientName ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—"} • Tooth {r.toothNumber || "Full"} • {r.dentistName ?? "—"}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground">{format(parseISO(r.date), "MMM d, yyyy")}</span>
              </div>
            ))}
            {records.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No treatments recorded yet.</p>
            )}
          </div>
          )}
        </CardContent>
      </Card>
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
