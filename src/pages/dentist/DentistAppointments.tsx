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
import { Eye, Stethoscope, CalendarClock, XCircle } from "lucide-react";
import {
  useDentistAppointments, rescheduleAppointment, cancelAppointment, completeConsultation,
  type DentistAppointment,
} from "@/lib/dentistAppointmentStore";
import { dentistSchedules, generateSlots, toLabel, toMinutes } from "@/lib/dentistSchedules";

const statusColors: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const emptyRecord = {
  procedure: "", diagnosis: "", treatmentNotes: "", prescription: "", nextVisit: "",
};

export default function DentistAppointments() {
  const { user } = useAuth();
  const appointments = useDentistAppointments();

  const schedule = useMemo(
    () => dentistSchedules.find(s => s.id === user?.id) ?? dentistSchedules.find(s => s.name === user?.name),
    [user],
  );

  const mine = useMemo(
    () => appointments
      .filter(a => !user?.name || a.dentist === user.name)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [appointments, user],
  );

  const [details, setDetails] = useState<DentistAppointment | null>(null);
  const [consult, setConsult] = useState<DentistAppointment | null>(null);
  const [resched, setResched] = useState<DentistAppointment | null>(null);
  const [cancelApt, setCancelApt] = useState<DentistAppointment | null>(null);

  const [recordForm, setRecordForm] = useState(emptyRecord);
  const [rsReason, setRsReason] = useState("");
  const [rsRemarks, setRsRemarks] = useState("");
  const [rsDate, setRsDate] = useState("");
  const [rsSlot, setRsSlot] = useState("");
  const [cxReason, setCxReason] = useState("");
  const [cxRemarks, setCxRemarks] = useState("");

  const slots = useMemo(() => {
    if (!rsDate || !schedule) return [];
    const bookedForDate = mine
      .filter(a => a.date === rsDate && (a.status === "confirmed" || a.status === "pending" || a.status === "rescheduled"))
      .map(a => a.time);
    const merged = {
      ...schedule,
      booked: { ...schedule.booked, [rsDate]: [...(schedule.booked[rsDate] ?? []), ...bookedForDate] },
    };
    return generateSlots(merged, parseISO(rsDate));
  }, [rsDate, schedule, mine]);

  const openResched = (apt: DentistAppointment) => {
    setRsReason(""); setRsRemarks(""); setRsDate(""); setRsSlot("");
    setResched(apt);
  };
  const openCancel = (apt: DentistAppointment) => {
    setCxReason(""); setCxRemarks(""); setCancelApt(apt);
  };
  const openConsult = (apt: DentistAppointment) => {
    setRecordForm(emptyRecord); setConsult(apt);
  };

  const submitConsult = () => {
    if (!consult) return;
    if (!recordForm.procedure.trim() || !recordForm.diagnosis.trim()) {
      toast({ title: "Missing information", description: "Procedure and diagnosis are required.", variant: "destructive" });
      return;
    }
    completeConsultation(consult.id, {
      patient: consult.patient,
      dentist: consult.dentist,
      date: consult.date,
      service: consult.service,
      ...recordForm,
    });
    toast({ title: "Consultation saved", description: `Dental record added to ${consult.patient}'s history. Appointment marked as Completed.` });
    setConsult(null);
  };

  const submitResched = () => {
    if (!resched) return;
    if (!rsReason.trim()) {
      toast({ title: "Reason required", description: "Please enter the reason for rescheduling.", variant: "destructive" });
      return;
    }
    if (!rsDate || !rsSlot) {
      toast({ title: "Schedule required", description: "Please select a new date and an available time slot.", variant: "destructive" });
      return;
    }
    rescheduleAppointment(resched.id, { date: rsDate, time: rsSlot, reason: rsReason, remarks: rsRemarks });
    toast({ title: "Appointment rescheduled", description: `Email notification sent to ${resched.email} with the new schedule.` });
    setResched(null);
  };

  const submitCancel = () => {
    if (!cancelApt) return;
    if (!cxReason.trim()) {
      toast({ title: "Reason required", description: "Please enter the cancellation reason.", variant: "destructive" });
      return;
    }
    cancelAppointment(cancelApt.id, cxReason, cxRemarks);
    toast({ title: "Appointment cancelled", description: `Email notification sent to ${cancelApt.email}.` });
    setCancelApt(null);
  };

  const actionable = (s: string) => s === "pending" || s === "confirmed" || s === "rescheduled";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Appointments</h1>
        <p className="text-muted-foreground">Appointments assigned to you</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Assigned Appointments</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Appointment Date</TableHead>
                <TableHead>Appointment Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                    No appointments assigned to you.
                  </TableCell>
                </TableRow>
              )}
              {mine.map(apt => (
                <TableRow key={apt.id}>
                  <TableCell className="font-medium">{apt.patient}</TableCell>
                  <TableCell>{apt.service}</TableCell>
                  <TableCell>{format(parseISO(apt.date), "MMM d, yyyy")}</TableCell>
                  <TableCell>{toLabel(toMinutes(apt.time))}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDetails(apt)}>
                        <Eye className="w-4 h-4 mr-1" /> View Details
                      </Button>
                      {actionable(apt.status) && (
                        <>
                          <Button size="sm" onClick={() => openConsult(apt)}>
                            <Stethoscope className="w-4 h-4 mr-1" /> Start Consultation
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openResched(apt)}>
                            <CalendarClock className="w-4 h-4 mr-1" /> Reschedule
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openCancel(apt)}>
                            <XCircle className="w-4 h-4 mr-1" /> Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View details */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-lg bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Appointment Details</DialogTitle>
          </DialogHeader>
          {details && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Field label="Patient Name" value={details.patient} />
              <Field label="Contact Number" value={details.contact} />
              <Field label="Email Address" value={details.email} />
              <Field label="Selected Service" value={details.service} />
              <Field label="Appointment Date" value={format(parseISO(details.date), "MMMM d, yyyy")} />
              <Field label="Appointment Time" value={toLabel(toMinutes(details.time))} />
              <Field label="Appointment Type" value={details.type === "walk-in" ? "Walk-in" : "Online"} />
              <Field label="Current Status" value={details.status} />
              {details.reason && <div className="col-span-2"><Field label="Reason" value={details.reason} /></div>}
              {details.remarks && <div className="col-span-2"><Field label="Remarks" value={details.remarks} /></div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Consultation / dental record form */}
      <Dialog open={!!consult} onOpenChange={(o) => !o && setConsult(null)}>
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Dental Record Form</DialogTitle>
            <DialogDescription>
              {consult && `${consult.patient} • ${consult.service} • ${format(parseISO(consult.date), "MMM d, yyyy")}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Procedure Performed *</Label>
              <Input value={recordForm.procedure} onChange={e => setRecordForm({ ...recordForm, procedure: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Diagnosis *</Label>
              <Input value={recordForm.diagnosis} onChange={e => setRecordForm({ ...recordForm, diagnosis: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Treatment Notes</Label>
              <Textarea value={recordForm.treatmentNotes} onChange={e => setRecordForm({ ...recordForm, treatmentNotes: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Prescription</Label>
              <Textarea value={recordForm.prescription} onChange={e => setRecordForm({ ...recordForm, prescription: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Visit (optional)</Label>
              <Input type="date" value={recordForm.nextVisit} onChange={e => setRecordForm({ ...recordForm, nextVisit: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConsult(null)}>Cancel</Button>
            <Button onClick={submitConsult}>Save Consultation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule */}
      <Dialog open={!!resched} onOpenChange={(o) => !o && setResched(null)}>
        <DialogContent className="max-w-lg bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Reschedule Appointment</DialogTitle>
            <DialogDescription>For emergency cases only (emergency leave, sudden illness, clinic emergency).</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason for Rescheduling *</Label>
              <Textarea value={rsReason} onChange={e => setRsReason(e.target.value)} placeholder="e.g. Emergency leave" />
            </div>
            <div className="space-y-2">
              <Label>New Appointment Date *</Label>
              <Input
                type="date"
                value={rsDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={e => { setRsDate(e.target.value); setRsSlot(""); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Available Time Slot *</Label>
              <Select value={rsSlot} onValueChange={setRsSlot} disabled={!rsDate || slots.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={!rsDate ? "Select a date first" : slots.length ? "Select a time slot" : "No slots available"} />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {slots.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {rsDate && slots.length === 0 && (
                <p className="text-xs text-destructive">
                  No available appointment slots for the selected date. Please choose another date.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea value={rsRemarks} onChange={e => setRsRemarks(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResched(null)}>Cancel</Button>
            <Button onClick={submitResched}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={!!cancelApt} onOpenChange={(o) => !o && setCancelApt(null)}>
        <DialogContent className="max-w-lg bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Cancel Appointment</DialogTitle>
            <DialogDescription>For emergency cases only. The patient will be notified by email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cancellation Reason *</Label>
              <Textarea value={cxReason} onChange={e => setCxReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Remarks (optional)</Label>
              <Textarea value={cxRemarks} onChange={e => setCxRemarks(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelApt(null)}>Back</Button>
            <Button variant="destructive" onClick={submitCancel}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground capitalize">{value}</p>
    </div>
  );
}
