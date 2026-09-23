import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Clock3, CalendarIcon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { manilaTodayAsLocalDate } from "@/lib/formatDate";
import { useAuth } from "@/contexts/AuthContext";
import { createAppointment } from "@/lib/api/appointments";
import { SERVICE_SEPARATOR, endTimeFor, formatDuration, totalServiceMinutes } from "@/lib/services";
import { getServices } from "@/lib/api/dentalRecords";
import { getBookedSlots } from "@/lib/api/appointments";
import {
  getDentistDirectory, getDentistSchedule, generateAvailableSlots, isDentistAvailableOn,
  DAY_NAMES, type DentistDirectoryEntry, type DentistScheduleData,
} from "@/lib/api/staff";

const services = [
  "Orthodontics (Braces)",
  "EXO (Bunot)",
  "Restoration",
  "Oral",
  "Veeners",
  "Denture (Pustiso)",
  "Implant",
  "Surgery",
  "TMJ",
  "Root Canal",
  "Teeth Whitening",
  "Fixed Bridge",
];


export default function PatientBook() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A visit can cover several services, e.g. a cleaning and a filling in one sitting.
  const [chosen, setChosen] = useState<string[]>([]);
  const [dentistId, setDentistId] = useState("");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  // Bumped to re-fetch the free slots, e.g. after someone else took the chosen one.
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [dentists, setDentists] = useState<DentistDirectoryEntry[]>([]);
  const [loadingDentists, setLoadingDentists] = useState(true);
  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const dentist = dentists.find((d) => d.id === dentistId)?.name ?? "";
  const remaining = services.filter((s) => !chosen.includes(s));
  const serviceLabel = chosen.join(SERVICE_SEPARATOR);

  // How long each service takes, as the clinic has it configured.
  const [durations, setDurations] = useState<Record<string, number>>({});
  const visitMinutes = totalServiceMinutes(chosen, durations);

  useEffect(() => {
    getServices()
      .then(list => setDurations(Object.fromEntries(
        list.filter(s => s.duration != null).map(s => [s.name, s.duration as number]))))
      .catch(() => {/* fall back to the default length per service */});
  }, []);

  useEffect(() => {
    getDentistDirectory()
      .then(setDentists)
      .catch(() => toast.error("Failed to load dentists"))
      .finally(() => setLoadingDentists(false));
  }, []);

  useEffect(() => {
    if (!dentistId) { setSchedule(null); return; }
    setLoadingSchedule(true);
    getDentistSchedule(dentistId)
      .then(setSchedule)
      .catch(() => toast.error("Failed to load dentist's schedule"))
      .finally(() => setLoadingSchedule(false));
  }, [dentistId]);

  useEffect(() => {
    if (!dentistId || !date || !schedule) { setSlots([]); return; }
    setLoadingSlots(true);
    getBookedSlots({ dentistId, dentistName: dentist, date: toKey(date) })
      .then((booked) => {
        const free = generateAvailableSlots(schedule, date, booked, visitMinutes);
        setSlots(free);
        // Adding a service can make the time already picked too short to fit.
        setTime(t => (free.some(s => s.value === t) ? t : ""));
      })
      .catch(() => toast.error("Failed to load available time slots"))
      .finally(() => setLoadingSlots(false));
  }, [dentistId, date, schedule, slotsVersion, visitMinutes]);

  const scheduleSummary = useMemo(() => {
    if (!schedule || schedule.days.length === 0) return "";
    return [...schedule.days]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((d) => `${DAY_NAMES[d.dayOfWeek].slice(0, 3)} ${toLabel(toMinutes(d.start))}–${toLabel(toMinutes(d.end))}`)
      .join(", ");
  }, [schedule]);

  const selectedLabel = slots.find((s) => s.value === time)?.label ?? "";

  const handleSubmit = async () => {
    if (chosen.length === 0 || !dentistId || !date || !time || !user) return;
    setSubmitting(true);
    try {
      await createAppointment({
        patientName: user.name,
        email: user.email,
        dentistId,
        dentistName: dentist,
        service: serviceLabel,
        date: toKey(date),
        time,
        endTime: endTimeFor(time, visitMinutes),
        type: "online",
      });
      setSubmitted(true);
      toast.success("Appointment request submitted — pending admin approval");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit appointment request");
      // Most likely the slot was taken in the meantime: show what's actually free now.
      setTime("");
      setSlotsVersion((v) => v + 1);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
          <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
            <Clock3 className="w-10 h-10 text-warning" />
          </div>
          <h2 className="text-2xl font-bold font-heading text-foreground">Appointment Request Submitted</h2>
          <Badge variant="outline" className="mt-3 bg-warning/10 text-warning border-warning/20">Pending admin approval</Badge>
          <p className="text-muted-foreground mt-3">
            {serviceLabel} on {date ? format(date, "PPP") : ""} at {selectedLabel} with {dentist}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Your request is not confirmed yet. You will be notified once the clinic admin approves it.
          </p>
          <Button
            className="mt-6 gradient-primary text-primary-foreground"
            onClick={() => {
              setSubmitted(false);
              setChosen([]);
              setDentistId("");
              setDate(undefined);
              setTime("");
            }}
          >
            Book Another
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Book Appointment</h1>
        <p className="text-muted-foreground">Schedule your next dental visit</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-6 space-y-5">
          {/* Step 1: Service(s) */}
          <div>
            <Label>Select Service</Label>
            {chosen.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {chosen.map(s => (
                  <Badge key={s} variant="secondary" className="gap-1 py-1 pl-3 pr-1 text-sm font-normal">
                    {s}
                    <button
                      type="button"
                      aria-label={`Remove ${s}`}
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                      onClick={() => setChosen(prev => prev.filter(c => c !== s))}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {/* Always shows its placeholder: picking an option adds to the list above
                rather than replacing a single selection. */}
            <Select
              value=""
              disabled={remaining.length === 0}
              onValueChange={(v) => setChosen(prev => [...prev, v])}
            >
              <SelectTrigger className="mt-2" aria-label="Add a service">
                <SelectValue placeholder={
                  remaining.length === 0 ? "All services added"
                    : chosen.length === 0 ? "Choose a service"
                    : "Add another service"
                } />
              </SelectTrigger>
              <SelectContent>{remaining.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {chosen.length === 0
                ? "Add as many services as you need for this visit."
                : `About ${formatDuration(visitMinutes)} in the chair — only slots with that much free time are offered.`}
            </p>
          </div>

          {/* Step 2: Dentist */}
          <div>
            <Label className="font-semibold">Select Dentist</Label>
            <Select
              value={dentistId}
              disabled={chosen.length === 0 || loadingDentists}
              onValueChange={(val) => { setDentistId(val); setDate(undefined); setTime(""); }}
            >
              <SelectTrigger aria-label="Choose a dentist">
                <SelectValue placeholder={chosen.length === 0 ? "Select a service first" : loadingDentists ? "Loading dentists..." : "Choose a dentist"} />
              </SelectTrigger>
              <SelectContent>
                {dentists.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!loadingDentists && dentists.length === 0 && (
              <p className="text-xs text-destructive mt-1">No dentists are available for booking right now.</p>
            )}
            {loadingSchedule && (
              <p className="text-xs text-muted-foreground mt-1">Loading schedule...</p>
            )}
            {!loadingSchedule && schedule && schedule.days.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Working hours: {scheduleSummary}</p>
            )}
            {!loadingSchedule && dentistId && schedule && schedule.days.length === 0 && (
              <p className="text-xs text-destructive mt-1">This dentist has no working schedule configured yet.</p>
            )}
          </div>

          {/* Step 3: Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Appointment Date</Label>
              <Popover>
                <PopoverTrigger asChild disabled={!dentistId}>
                  <Button variant="outline" disabled={!dentistId} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>{dentistId ? "Pick a date" : "Select a dentist first"}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); setTime(""); }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    disabled={(d) => {
                      if (d < manilaTodayAsLocalDate()) return true;
                      if (!schedule) return true;
                      return !isDentistAvailableOn(schedule, d);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Step 4: Time slot */}
            <div>
              <Label className="font-semibold">Available Time Slot</Label>
              <Select value={time} onValueChange={setTime} disabled={!dentistId || !date || loadingSlots || slots.length === 0}>
                <SelectTrigger aria-label="Choose a time slot">
                  <SelectValue placeholder={!dentistId || !date ? "Select dentist and date first" : loadingSlots ? "Loading slots..." : slots.length === 0 ? "No slots available" : "Choose a time slot"} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {dentistId && date && !loadingSlots && slots.length === 0 && (
                <p className="text-sm text-destructive mt-2">
                  No available appointment slots for the selected date. Please choose another date.
                </p>
              )}
              {dentistId && date && !loadingSlots && slots.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {slots.length} slot{slots.length > 1 ? "s" : ""} available for {dentist}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Appointment requests are submitted as <span className="text-warning font-medium">Pending</span> and require admin approval.
          </p>

          <Button
            className="w-full gradient-primary text-primary-foreground"
            disabled={chosen.length === 0 || !dentistId || !date || !time || submitting}
            onClick={handleSubmit}
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-2" />}
            Confirm Appointment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
