import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { Eye, Stethoscope, CalendarClock, XCircle, ChevronDown, Loader2, Printer, Clock3 } from "lucide-react";
import { createDentalRecord } from "@/lib/api/dentalRecords";
import { formatTimeRange } from "@/lib/dentistSchedules";
import { getAppointments, rescheduleAppointment, cancelAppointment, completeAppointment, describeEmailOutcome, type Appointment } from "@/lib/api/appointments";
import { getDentistSchedule, generateAvailableSlots, type DentistScheduleData } from "@/lib/api/staff";
import { formatManilaDate, manilaTodayDateStr } from "@/lib/formatDate";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // `silent` is for background refreshes: no spinner over the table and no error
  // toast, so polling is invisible unless something actually changed.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    getAppointments()
      .then(setAppointments)
      .catch(() => { if (!silent) toast({ title: "Failed to load appointments", variant: "destructive" }); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => load(), []);
  // Pick up changes made by other people without needing a manual page refresh.
  useAutoRefresh(() => load(true));

  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  useEffect(() => {
    if (!user) return;
    getDentistSchedule(user.id).then(setSchedule).catch(() => {});
  }, [user]);

  const mine = useMemo(
    () => appointments
      .filter(a => !user?.name || a.dentistName === user.name)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [appointments, user],
  );

  const [details, setDetails] = useState<Appointment | null>(null);

  // Arrived here from a notification bell click — scroll to that appointment's row.
  const { highlightedKey, registerRow } = useNotificationJump(
    useCallback((id: string) => mine.find(a => a.id === id)?.id, [mine]),
  );

  const [consult, setConsult] = useState<Appointment | null>(null);
  const [resched, setResched] = useState<Appointment | null>(null);
  const [cancelApt, setCancelApt] = useState<Appointment | null>(null);

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
    return generateAvailableSlots(schedule, parseISO(rsDate), bookedForDate);
  }, [rsDate, schedule, mine]);

  const openResched = (apt: Appointment) => {
    setRsReason(""); setRsRemarks(""); setRsDate(""); setRsSlot("");
    setResched(apt);
  };
  const openCancel = (apt: Appointment) => {
    setCxReason(""); setCxRemarks(""); setCancelApt(apt);
  };
  const openConsult = (apt: Appointment) => {
    setRecordForm(emptyRecord); setConsult(apt);
  };

  const submitConsult = async () => {
    if (!consult) return;
    if (!recordForm.procedure.trim() || !recordForm.diagnosis.trim()) {
      toast({ title: "Missing information", description: "Procedure and diagnosis are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await completeAppointment(consult.id);
      await createDentalRecord({
        appointmentId: consult.id,
        date: consult.date,
        diagnosis: recordForm.diagnosis,
        treatments: [{ serviceName: recordForm.procedure }],
        treatmentNotes: recordForm.treatmentNotes || undefined,
        prescriptions: recordForm.prescription.trim() ? [{ medicine: recordForm.prescription.trim() }] : undefined,
        nextVisit: recordForm.nextVisit || undefined,
      });
      toast({ title: "Consultation saved", description: `Dental record added to ${consult.patientName}'s history. Appointment marked as Completed.` });
      setConsult(null);
      load();
    } catch (err) {
      toast({ title: "Failed to save consultation", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitResched = async () => {
    if (!resched) return;
    if (!rsReason.trim()) {
      toast({ title: "Reason required", description: "Please enter the reason for rescheduling.", variant: "destructive" });
      return;
    }
    if (!rsDate || !rsSlot) {
      toast({ title: "Schedule required", description: "Please select a new date and an available time slot.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await rescheduleAppointment(resched.id, { date: rsDate, time: rsSlot, reason: rsReason, remarks: rsRemarks });
      const email = describeEmailOutcome(result, "Reschedule");
      toast({ title: "Appointment rescheduled", description: email.text, variant: email.ok ? "default" : "destructive" });
      setResched(null);
      load();
    } catch (err) {
      toast({ title: "Failed to reschedule", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitCancel = async () => {
    if (!cancelApt) return;
    if (!cxReason.trim()) {
      toast({ title: "Reason required", description: "Please enter the cancellation reason.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await cancelAppointment(cancelApt.id, cxReason, cxRemarks);
      const email = describeEmailOutcome(result, "Cancellation");
      toast({ title: "Appointment cancelled", description: email.text, variant: email.ok ? "default" : "destructive" });
      setCancelApt(null);
      load();
    } catch (err) {
      toast({ title: "Failed to cancel", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Only approved bookings can be treated, moved or cancelled from here. A pending one
  // is still just a request — the clinic may yet reject it — so it waits for approval.
  const actionable = (s: string) => s === "confirmed" || s === "rescheduled";

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Assigned Appointments · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">My Appointments</h1>
          <p className="text-muted-foreground">Appointments assigned to you</p>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Assigned Appointments</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Appointment Date</TableHead>
                <TableHead>Appointment Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right print:hidden">Actions</TableHead>
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
                <TableRow
                  key={apt.id}
                  ref={registerRow(apt.id)}
                  className={highlightedKey === apt.id ? HIGHLIGHT_ROW_CLASS : undefined}
                >
                  <TableCell className="font-medium">{apt.patientName}</TableCell>
                  <TableCell>{apt.service}</TableCell>
                  <TableCell>{format(parseISO(apt.date), "MMM d, yyyy")}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatTimeRange(apt.time, apt.endTime)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                  </TableCell>
                  <TableCell className="print:hidden">
                    {/* Full button row on larger screens */}
                    <div className="hidden lg:flex flex-wrap gap-2 justify-end">
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
                      {apt.status === "pending" && (
                        <span className="self-center text-xs text-muted-foreground">Awaiting admin approval</span>
                      )}
                    </div>

                    {/* Compact controls on phone/tablet */}
                    <div className="flex lg:hidden items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="View Details" onClick={() => setDetails(apt)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      {actionable(apt.status) ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More options">
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => openConsult(apt)}>
                              <Stethoscope className="w-4 h-4 mr-2" /> Start Consultation
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openResched(apt)}>
                              <CalendarClock className="w-4 h-4 mr-2" /> Reschedule
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openCancel(apt)} className="text-destructive focus:text-destructive">
                              <XCircle className="w-4 h-4 mr-2" /> Cancel
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : apt.status === "pending" ? (
                        <span className="h-8 w-8 inline-flex items-center justify-center text-muted-foreground" title="Awaiting admin approval" aria-label="Awaiting admin approval">
                          <Clock3 className="w-4 h-4" />
                        </span>
                      ) : (
                        <div className="h-8 w-8" aria-hidden="true" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
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
              <Field label="Patient Name" value={details.patientName} />
              <Field label="Contact Number" value={details.contact ?? "—"} />
              <Field label="Email Address" value={details.email ?? "—"} />
              <Field label="Selected Service" value={details.service} />
              <Field label="Appointment Date" value={format(parseISO(details.date), "MMMM d, yyyy")} />
              <Field label="Appointment Time" value={formatTimeRange(details.time, details.endTime)} />
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
              {consult && `${consult.patientName} • ${consult.service} • ${format(parseISO(consult.date), "MMM d, yyyy")}`}
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
            <Button onClick={submitConsult} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Consultation</Button>
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
                min={manilaTodayDateStr()}
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
            <Button onClick={submitResched} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes</Button>
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
            <Button variant="destructive" onClick={submitCancel} disabled={saving}>Save</Button>
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
