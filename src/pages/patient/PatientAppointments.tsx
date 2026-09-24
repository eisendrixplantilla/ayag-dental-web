import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Eye, Edit, X, Info, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { toKey, toLabel, toMinutes, formatTimeRange } from "@/lib/dentistSchedules";
import { getAppointments, getBookedSlots, rescheduleAppointment, cancelAppointment, type Appointment } from "@/lib/api/appointments";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { getDentistSchedule, generateAvailableSlots, isDentistAvailableOn, type DentistScheduleData } from "@/lib/api/staff";
import { formatManilaDate, manilaTodayAsLocalDate } from "@/lib/formatDate";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { appointmentRef } from "@/lib/appointmentRef";

const statusColors: Record<string, string> = {
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
};

const NOTICE_24H = "Rescheduling is only allowed at least 24 hours before your scheduled appointment.";

// Appointment date/time are Manila wall-clock values (the clinic's only location), so the
// absolute instant must be computed against Manila's offset, not the viewing device's own.
const toDateTime = (apt: Appointment) => new Date(`${apt.date}T${apt.time}:00+08:00`);

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsApt, setDetailsApt] = useState<Appointment | null>(null);
  const [rescheduleApt, setRescheduleApt] = useState<Appointment | null>(null);
  const [cancelApt, setCancelApt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState<Date>();
  const [newTime, setNewTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("upcoming");

  // `silent` is for background refreshes: no spinner over the table and no error
  // toast, so polling is invisible unless something actually changed.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    getAppointments()
      .then(setAppointments)
      .catch(() => { if (!silent) toast.error("Failed to load appointments"); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => load(), []);
  // Pick up changes made by other people without needing a manual page refresh.
  useAutoRefresh(() => load(true));

  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!rescheduleApt?.dentistId) { setSchedule(null); return; }
    getDentistSchedule(rescheduleApt.dentistId).then(setSchedule).catch(() => setSchedule(null));
  }, [rescheduleApt]);

  useEffect(() => {
    if (!rescheduleApt?.dentistId || !newDate || !schedule) { setSlots([]); return; }
    setLoadingSlots(true);
    getBookedSlots({
      dentistId: rescheduleApt.dentistId, dentistName: rescheduleApt.dentistName,
      date: toKey(newDate), excludeId: rescheduleApt.id,
    })
      .then((booked) => setSlots(generateAvailableSlots(schedule, newDate, booked)))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [rescheduleApt, newDate, schedule]);

  const upcoming = appointments
    .filter((a) => a.status === "pending" || a.status === "confirmed" || a.status === "rescheduled")
    .sort((a, b) => toDateTime(a).getTime() - toDateTime(b).getTime());
  const history = appointments
    .filter((a) => !["pending", "confirmed", "rescheduled"].includes(a.status))
    .sort((a, b) => toDateTime(b).getTime() - toDateTime(a).getTime());

  // Arrived here from a notification bell click.
  const { highlightedKey, registerRow, pendingId } = useNotificationJump(
    useCallback((id: string) => appointments.find(a => a.id === id)?.id, [appointments]),
  );

  // The target may sit in the Past tab, which isn't mounted by default — switch to
  // it once the data has loaded so there's actually a row to scroll to.
  useEffect(() => {
    if (!pendingId) return;
    if (history.some(a => a.id === pendingId)) setTab("past");
    else if (upcoming.some(a => a.id === pendingId)) setTab("upcoming");
  }, [pendingId, appointments]);

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
      // If the slot was taken meanwhile, drop the choice so the list re-checks what's free.
      setNewTime("");
      setNewDate((d) => (d ? new Date(d) : d));
    } finally {
      setSaving(false);
    }
  };

  const print = usePrintDocument();
  const aptRow = (apt: Appointment) => [
    appointmentRef(apt.id),
    apt.service,
    apt.dentistName ?? "—",
    format(parseISO(apt.date), "MMM d, yyyy"),
    formatTimeRange(apt.time, apt.endTime),
    apt.status,
  ];
  const APT_COLUMNS = ["Reference", "Service", "Dentist", "Date", "Time", "Status"];
  const handlePrint = () =>
    print({
      title: "My Appointments",
      tables: [
        { heading: "Upcoming", columns: APT_COLUMNS, rows: upcoming.map(aptRow), emptyText: "No upcoming appointments." },
        { heading: "Past", columns: APT_COLUMNS, rows: history.map(aptRow), emptyText: "No past appointments." },
      ],
    });

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
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">My Appointments · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">My Appointments</h1>
          <p className="text-muted-foreground">View, reschedule, or cancel appointments</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>
      <Card className="shadow-card">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-4 print:hidden">
              <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
              <TabsTrigger value="past">Past ({history.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="upcoming">
              <div className="space-y-3">
                {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming appointments.</p>}
                {upcoming.map((apt) => {
                  const allowed = hours24(apt);
                  // A patient's move lands back in the pending queue, so the one-time
                  // limit counts the moves themselves rather than the status.
                  const canReschedule = allowed && apt.rescheduleCount === 0;
                  return (
                    <div
                      key={apt.id}
                      ref={registerRow(apt.id)}
                      className={`p-4 rounded-lg bg-muted/50 space-y-2 ${highlightedKey === apt.id ? HIGHLIGHT_ROW_CLASS : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="font-medium text-foreground">{apt.service}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(apt.date), "PPP")} at {formatTimeRange(apt.time, apt.endTime)} • {apt.dentistName}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                          <div className="flex items-center gap-2 flex-wrap print:hidden">
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
                      </div>
                      {!allowed && (
                        <p className="text-xs text-warning flex items-center gap-1">
                          <Info className="w-3 h-3" /> {NOTICE_24H}
                        </p>
                      )}
                      {apt.status === "pending" && apt.rescheduleCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Your new time is waiting for the clinic to approve it.
                        </p>
                      )}
                      {allowed && apt.rescheduleCount > 0 && (
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
                  <div
                    key={apt.id}
                    ref={registerRow(apt.id)}
                    className={`flex items-center justify-between p-4 rounded-lg bg-muted/50 ${highlightedKey === apt.id ? HIGHLIGHT_ROW_CLASS : ""}`}
                  >
                    <div>
                      <p className="font-medium text-foreground">{apt.service}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(apt.date), "PPP")} at {formatTimeRange(apt.time, apt.endTime)} • {apt.dentistName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 print:hidden" title="View Details" onClick={() => setDetailsApt(apt)}>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{formatTimeRange(detailsApt.time, detailsApt.endTime)}</span></div>
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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Reschedule Appointment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {rescheduleApt?.service} with {rescheduleApt?.dentistName}. You can reschedule only once,
              and the clinic has to approve the new time before it's confirmed.
            </p>
            {/* Same shape as booking: the month, then that day's free times. */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">New Date</Label>
              <div className="rounded-md border w-fit max-w-full overflow-x-auto mx-auto sm:mx-0">
                <Calendar
                  mode="single"
                  selected={newDate}
                  onSelect={(d) => { setNewDate(d); setNewTime(""); }}
                  className="p-2 pointer-events-auto"
                  disabled={(d) => {
                    if (d < manilaTodayAsLocalDate()) return true;
                    if (!schedule) return true;
                    return !isDentistAvailableOn(schedule, d);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  {newDate ? `Times on ${format(newDate, "EEE, MMM d")}` : "Available times"}
                </Label>
                {newDate && !loadingSlots && slots.length > 0 && (
                  <span className="text-xs text-muted-foreground">{slots.length} free</span>
                )}
              </div>
              {!newDate ? (
                <p className="text-sm text-muted-foreground py-4 px-3 text-center border border-dashed rounded-md">
                  Pick a date to see the free times.
                </p>
              ) : loadingSlots ? (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading times...
                </p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-destructive py-4 px-3 text-center border border-dashed rounded-md">
                  Fully booked that day — please pick another date.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Available time slots"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1"
                >
                  {slots.map((s) => (
                    <Button
                      key={s.value}
                      type="button"
                      size="sm"
                      variant={newTime === s.value ? "default" : "outline"}
                      aria-pressed={newTime === s.value}
                      className={cn("h-11 sm:h-9 px-2 justify-center font-normal text-[11px] sm:text-xs whitespace-nowrap",
                        newTime === s.value && "gradient-primary text-primary-foreground")}
                      onClick={() => setNewTime(s.value)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              After rescheduling, your appointment goes back to <span className="text-warning font-medium">Pending</span> and requires admin approval.
            </p>
            <Button
              className="w-full gradient-primary text-primary-foreground h-11 sm:h-10"
              disabled={!newDate || !newTime || saving}
              onClick={confirmReschedule}
            >
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
