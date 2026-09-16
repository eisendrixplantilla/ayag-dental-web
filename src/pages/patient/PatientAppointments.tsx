import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Eye, CalendarIcon, Edit, X, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

type Status = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

interface Appointment {
  id: number;
  service: string;
  date: Date;
  time: string; // "10:00"
  dentist: string;
  status: Status;
  rescheduled: boolean;
  treatment?: string;
  notes?: string;
}

interface DentistSchedule {
  name: string;
  workingDays: number[];
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
  duration: number;
  maxPatientsPerDay: number;
  leave: string[];
  booked: Record<string, string[]>;
}

const toKey = (d: Date) => format(d, "yyyy-MM-dd");
const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toKey(d);
};
const atTime = (offsetDays: number, time: string) => {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, m, 0, 0);
  return d;
};

const dentistSchedules: DentistSchedule[] = [
  { name: "Dr. Ayag", workingDays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", lunchStart: "12:00", lunchEnd: "13:00", duration: 30, maxPatientsPerDay: 10, leave: [dayKey(3)], booked: { [dayKey(1)]: ["09:00", "09:30", "13:00"] } },
  { name: "Dr. Santos", workingDays: [1, 3, 5], start: "10:00", end: "16:00", lunchStart: "12:00", lunchEnd: "13:00", duration: 30, maxPatientsPerDay: 6, leave: [], booked: { [dayKey(2)]: ["10:00", "10:30"] } },
  { name: "Dr. Reyes", workingDays: [2, 4, 6], start: "09:00", end: "15:00", lunchStart: "11:30", lunchEnd: "12:30", duration: 45, maxPatientsPerDay: 5, leave: [dayKey(5)], booked: {} },
  { name: "Dr. Cruz", workingDays: [1, 2, 3, 4, 5, 6], start: "08:00", end: "14:00", lunchStart: "11:00", lunchEnd: "12:00", duration: 60, maxPatientsPerDay: 4, leave: [], booked: { [dayKey(1)]: ["08:00"] } },
];

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toLabel = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
};
const timeLabel = (t: string) => toLabel(toMinutes(t));
const toValue = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

function generateSlots(schedule: DentistSchedule | undefined, date: Date | undefined) {
  if (!schedule || !date) return [] as { value: string; label: string }[];
  const key = toKey(date);
  if (schedule.leave.includes(key)) return [];
  if (!schedule.workingDays.includes(date.getDay())) return [];
  const booked = schedule.booked[key] ?? [];
  if (booked.length >= schedule.maxPatientsPerDay) return [];
  const remaining = schedule.maxPatientsPerDay - booked.length;
  const slots: { value: string; label: string }[] = [];
  const endMin = toMinutes(schedule.end);
  const lunchStart = toMinutes(schedule.lunchStart);
  const lunchEnd = toMinutes(schedule.lunchEnd);
  const now = new Date();
  const isToday = toKey(now) === key;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let t = toMinutes(schedule.start); t + schedule.duration <= endMin; t += schedule.duration) {
    const slotEnd = t + schedule.duration;
    if (t < lunchEnd && slotEnd > lunchStart) continue;
    const value = toValue(t);
    if (booked.includes(value)) continue;
    if (isToday && t <= nowMinutes) continue;
    slots.push({ value, label: toLabel(t) });
  }
  return slots.slice(0, remaining);
}

const initialAppointments: Appointment[] = [
  { id: 1, service: "Dental Cleaning", date: atTime(6, "10:00"), time: "10:00", dentist: "Dr. Ayag", status: "confirmed", rescheduled: false },
  { id: 2, service: "Check-up", date: atTime(14, "14:00"), time: "14:00", dentist: "Dr. Santos", status: "pending", rescheduled: false },
  { id: 3, service: "Root Canal", date: atTime(0, "16:00"), time: "16:00", dentist: "Dr. Cruz", status: "confirmed", rescheduled: false },
  { id: 4, service: "Teeth Whitening", date: atTime(10, "09:00"), time: "09:00", dentist: "Dr. Reyes", status: "confirmed", rescheduled: true },
];

const past: Appointment[] = [
  { id: 5, service: "Restoration", date: atTime(-30, "09:00"), time: "09:00", dentist: "Dr. Ayag", status: "completed", rescheduled: false, treatment: "Composite filling on tooth #14", notes: "No complications. Patient advised to avoid hard food for 24 hours." },
  { id: 6, service: "EXO (Bunot)", date: atTime(-60, "11:00"), time: "11:00", dentist: "Dr. Cruz", status: "cancelled", rescheduled: false },
  { id: 7, service: "Dental Cleaning", date: atTime(-90, "10:00"), time: "10:00", dentist: "Dr. Reyes", status: "completed", rescheduled: false, treatment: "Prophylaxis (full mouth cleaning)", notes: "Minor plaque buildup. Recommended flossing daily." },
  { id: 8, service: "Check-up", date: atTime(-120, "14:00"), time: "14:00", dentist: "Dr. Santos", status: "rejected", rescheduled: false },
];

const statusColors: Record<string, string> = {
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  completed: "bg-secondary text-secondary-foreground",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const NOTICE_24H = "Rescheduling is only allowed at least 24 hours before your scheduled appointment.";

export default function PatientAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [detailsApt, setDetailsApt] = useState<Appointment | null>(null);
  const [rescheduleApt, setRescheduleApt] = useState<Appointment | null>(null);
  const [cancelApt, setCancelApt] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState<Date>();
  const [newTime, setNewTime] = useState("");

  const schedule = dentistSchedules.find((d) => d.name === rescheduleApt?.dentist);
  const slots = useMemo(() => generateSlots(schedule, newDate), [schedule, newDate]);

  const upcoming = appointments.filter((a) => a.status === "pending" || a.status === "confirmed");
  const history = [...past, ...appointments.filter((a) => !["pending", "confirmed"].includes(a.status))].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );

  const hours24 = (apt: Appointment) => apt.date.getTime() - Date.now() >= 24 * 60 * 60 * 1000;

  const openReschedule = (apt: Appointment) => {
    setRescheduleApt(apt);
    setNewDate(undefined);
    setNewTime("");
  };

  const confirmReschedule = () => {
    if (!rescheduleApt || !newDate || !newTime) return;
    const [h, m] = newTime.split(":").map(Number);
    const d = new Date(newDate);
    d.setHours(h, m, 0, 0);
    setAppointments((prev) =>
      prev.map((a) => (a.id === rescheduleApt.id ? { ...a, date: d, time: newTime, status: "pending", rescheduled: true } : a))
    );
    setRescheduleApt(null);
    toast.success("Reschedule request submitted — pending admin approval");
  };

  const confirmCancel = () => {
    if (!cancelApt) return;
    setAppointments((prev) => prev.map((a) => (a.id === cancelApt.id ? { ...a, status: "cancelled" } : a)));
    setCancelApt(null);
    toast.success("Appointment cancelled");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Appointments</h1>
        <p className="text-muted-foreground">View, reschedule, or cancel appointments</p>
      </div>
      <Card className="shadow-card">
        <CardContent className="p-6">
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
                  const canReschedule = allowed && !apt.rescheduled;
                  return (
                    <div key={apt.id} className="p-4 rounded-lg bg-muted/50 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="font-medium text-foreground">{apt.service}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(apt.date, "PPP")} at {timeLabel(apt.time)} • {apt.dentist}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
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
                      {allowed && apt.rescheduled && (
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
                        {format(apt.date, "PPP")} at {timeLabel(apt.time)} • {apt.dentist}
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
        </CardContent>
      </Card>

      {/* Details */}
      <Dialog open={!!detailsApt} onOpenChange={(o) => !o && setDetailsApt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Appointment Details</DialogTitle></DialogHeader>
          {detailsApt && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">{detailsApt.service}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{format(detailsApt.date, "PPP")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{timeLabel(detailsApt.time)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dentist</span><span className="font-medium">{detailsApt.dentist}</span></div>
              <div className="flex justify-between items-center"><span className="text-muted-foreground">Status</span><Badge variant="outline" className={statusColors[detailsApt.status]}>{detailsApt.status}</Badge></div>
              {detailsApt.status !== "completed" && (
                <div className="flex justify-between"><span className="text-muted-foreground">Rescheduled</span><span className="font-medium">{detailsApt.rescheduled ? "Yes (one-time used)" : "No"}</span></div>
              )}
              {detailsApt.treatment && (
                <div className="pt-2 border-t border-border">
                  <p className="text-muted-foreground">Treatment Done</p>
                  <p className="font-medium text-foreground">{detailsApt.treatment}</p>
                </div>
              )}
              {detailsApt.notes && (
                <div>
                  <p className="text-muted-foreground">Notes</p>
                  <p className="text-foreground">{detailsApt.notes}</p>
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
              {rescheduleApt?.service} with {rescheduleApt?.dentist}. You can reschedule only once.
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
            <Button className="w-full gradient-primary text-primary-foreground" disabled={!newDate || !newTime} onClick={confirmReschedule}>
              Confirm Reschedule
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
              Cancel your {cancelApt?.service} appointment on {cancelApt ? format(cancelApt.date, "PPP") : ""} at {cancelApt ? timeLabel(cancelApt.time) : ""}? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelApt(null)}>Keep Appointment</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmCancel}>Cancel Appointment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
