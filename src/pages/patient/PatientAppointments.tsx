import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Eye, CalendarIcon, Edit, X, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { dentistSchedules, generateSlots, toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { getAppointments, rescheduleAppointment, cancelAppointment, type Appointment } from "@/lib/api/appointments";

const statusColors: Record<string, string> = {
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
};

const NOTICE_24H = "Rescheduling is only allowed at least 24 hours before your scheduled appointment.";

const toDateTime = (apt: Appointment) => {
  const [h, m] = apt.time.split(":").map(Number);
  const d = parseISO(apt.date);
  d.setHours(h, m, 0, 0);
  return d;
};

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsApt, setDetailsApt] = useState<Appointment | null>(null);
  const [rescheduleApt, setRescheduleApt] = useState<Appointment | null>(null);
  const [cancelApt, setCancelApt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState<Date>();
  const [newTime, setNewTime] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getAppointments()
      .then(setAppointments)
      .catch(() => toast.error("Failed to load appointments"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const schedule = dentistSchedules.find((d) => d.name === rescheduleApt?.dentistName);
  const slots = useMemo(() => generateSlots(schedule, newDate), [schedule, newDate]);

  const upcoming = appointments
    .filter((a) => a.status === "pending" || a.status === "confirmed" || a.status === "rescheduled")
    .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime());
  const history = appointments
    .filter((a) => !["pending", "confirmed", "rescheduled"].includes(a.status))
    .sort((a, b) => toDateTime(b).getTime() - toDateTime(a).getTime());

  const hours24 = (apt: Appointment) => toDateTime(apt).getTime() - Date.now() >= 24 * 60 * 60 * 1000;

  const openReschedule = (apt: Appointment) => {
    setRescheduleApt(apt);
    setNewDate(undefined);
    setNewTime("");
  };

  const confirmReschedule = async () => {
    if (!rescheduleApt || !newDate || !newTime) return;
    setSaving(true);
    try {
      await rescheduleAppointment(rescheduleApt.id, {
        date: toKey(newDate),
        time: newTime,
        reason: "Rescheduled by patient",
      });
      setRescheduleApt(null);
      toast.success("Reschedule request submitted — pending admin approval");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reschedule");
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelApt) return;
    setSaving(true);
    try {
      await cancelAppointment(cancelApt.id, "Cancelled by patient");
      setCancelApt(null);
      toast.success("Appointment cancelled");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Appointments</h1>
        <p className="text-muted-foreground">View, reschedule, or cancel appointments</p>
      </div>
      <Card className="shadow-card">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Tabs defaultValue="upcoming">
            <TabsList className="mb-4">
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({history.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming">
              <div className="space-y-3">
                {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming appointments.</p>}
                {upcoming.map((apt) => {
                  const allowed = hours24(apt);
                  const canReschedule = allowed && apt.status !== "rescheduled";
                  return (
                    <div key={apt.id} className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="font-medium text-foreground">{apt.service}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(apt.date), "PPP")} at {toLabel(toMinutes(apt.time))} • {apt.dentistName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="View Details" onClick={() => setDetailsApt(apt)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canReschedule && (
                            <Button variant="outline" size="sm" onClick={() => openReschedule(apt)}>
                              <Edit className="w-4 h-4 mr-1" /> Reschedule
                            </Button>
                          )}
                          {allowed && (
                            <Button variant="outline" size="sm" className="text-destructive" onClick={() => setCancelApt(apt)}>
                              <X className="w-4 h-4 mr-1" /> Cancel Appointment
                            </Button>
                          )}
                        </div>
                      </div>
                      {!allowed && (
                        <p className="text-xs text-warning flex items-center gap-1">
                          <Info className="w-3 h-3" /> {NOTICE_24H}
                        </p>
                      )}
                      {allowed && apt.status === "rescheduled" && (
                        <p className="text-xs text-muted-foreground">You have already used your one-time reschedule for this appointment.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>
            <TabsContent value="past">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">This is your appointment history. Completed appointments are view-only.</p>
                {history.map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground">{apt.service}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(apt.date), "PPP")} at {toLabel(toMinutes(apt.time))} • {apt.dentistName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View Details" onClick={() => setDetailsApt(apt)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Dialog open={!!detailsApt} onOpenChange={(o) => !o && setDetailsApt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Appointment Details</DialogTitle></DialogHeader>
          {detailsApt && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{detailsApt.service}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{format(parseISO(detailsApt.date), "PPP")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{toLabel(toMinutes(detailsApt.time))}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dentist</span><span className="font-medium">{detailsApt.dentistName}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><Badge variant="outline" className={statusColors[detailsApt.status]}>{detailsApt.status}</Badge></div>
              {detailsApt.reason && (
                <div className="pt-2 border-t border-border">
                  <p className="text-muted-foreground">Reason</p>
                  <p className="font-medium text-foreground">{detailsApt.reason}</p>
                </div>
              )}
              {detailsApt.remarks && (
                <div>
                  <p className="text-muted-foreground">Remarks</p>
                  <p className="text-foreground">{detailsApt.remarks}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule */}
      <Dialog open={!!rescheduleApt} onOpenChange={(o) => !o && setRescheduleApt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Reschedule Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rescheduleApt?.service} with {rescheduleApt?.dentistName}. You can reschedule only once.
            </p>
            <div>
              <Label>New Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newDate ? format(newDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newDate}
                    onSelect={(d) => { setNewDate(d); setNewTime(""); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    disabled={(d) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (d < today) return true;
                      if (!schedule) return true;
                      if (schedule.leave.includes(toKey(d))) return true;
                      return !schedule.workingDays.includes(d.getDay());
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="font-semibold">Available Time Slot</Label>
              <Select value={newTime} onValueChange={setNewTime} disabled={!newDate || slots.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={!newDate ? "Select a date first" : slots.length === 0 ? "No slots available" : "Choose a time slot"} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {newDate && slots.length === 0 && (
                <p className="text-sm text-destructive mt-2">
                  No available appointment slots for the selected date. Please choose another date.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              After rescheduling, your appointment goes back to <span className="text-warning font-medium">Pending</span> and requires admin approval.
            </p>
            <Button className="w-full gradient-primary text-primary-foreground" disabled={!newDate || !newTime || saving} onClick={confirmReschedule}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirm Reschedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel */}
      <Dialog open={!!cancelApt} onOpenChange={(o) => !o && setCancelApt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Cancel Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cancel your {cancelApt?.service} appointment on {cancelApt ? format(parseISO(cancelApt.date), "PPP") : ""} at {cancelApt ? toLabel(toMinutes(cancelApt.time)) : ""}? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelApt(null)}>Keep Appointment</Button>
              <Button variant="destructive" className="flex-1" disabled={saving} onClick={confirmCancel}>Cancel Appointment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
