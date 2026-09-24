import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Clock3, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { manilaTodayAsLocalDate } from "@/lib/formatDate";
import { useAuth } from "@/contexts/AuthContext";
import { createAppointment } from "@/lib/api/appointments";
import { FALLBACK_SERVICES, SERVICE_SEPARATOR, endTimeFor, formatDuration, totalServiceMinutes } from "@/lib/services";
import { getServices } from "@/lib/api/dentalRecords";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { getBookedSlots } from "@/lib/api/appointments";
import {
  getDentistDirectory, getDentistSchedule, generateAvailableSlots, isDentistAvailableOn,
  DAY_NAMES, type DentistDirectoryEntry, type DentistScheduleData,
} from "@/lib/api/staff";


export default function PatientBook() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // A visit can cover several services, e.g. a cleaning and a filling in one sitting.
  const [chosen, setChosen] = useState<string[]>([]);

  // What the clinic offers, and how long each one takes — straight from the
  // superadmin's Dental Services & Pricing list. A service becomes bookable once it
  // has a duration there.
  const [catalog, setCatalog] = useState<{ name: string; minutes: number }[]>([]);
  const services = catalog.length ? catalog.map(s => s.name) : FALLBACK_SERVICES;
  const durations = Object.fromEntries(catalog.map(s => [s.name, s.minutes]));
  const visitMinutes = totalServiceMinutes(chosen, durations);
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

  useEffect(() => {
    getServices()
      .then(list => setCatalog((list ?? [])
        .filter(s => s.duration != null)
        .map(s => ({ name: s.name, minutes: s.duration as number }))))
      .catch(() => {/* keep the fallback list and the default length per service */});
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

  // Read through a ref so a silent refresh can tell whether the chosen time is still
  // free, without re-running this whole effect every time the patient picks one.
  const timeRef = useRef(time);
  timeRef.current = time;

  const loadSlots = useCallback((silent = false) => {
    if (!dentistId || !date || !schedule) { setSlots([]); return; }
    if (!silent) setLoadingSlots(true);
    getBookedSlots({ dentistId, dentistName: dentist, date: toKey(date) })
      .then((booked) => {
        const free = generateAvailableSlots(schedule, date, booked, visitMinutes);
        setSlots(free);
        const picked = timeRef.current;
        if (picked && !free.some(s => s.value === picked)) {
          // Either another service just made the visit too long for it, or somebody
          // else took it while this form was open.
          setTime("");
          if (silent) toast.info("That time has just been taken. Please choose another.");
        }
      })
      .catch(() => { if (!silent) toast.error("Failed to load available time slots"); })
      .finally(() => { if (!silent) setLoadingSlots(false); });
  }, [dentistId, date, schedule, dentist, visitMinutes]);

  useEffect(() => { loadSlots(); }, [loadSlots, slotsVersion]);
  // Someone else can book the same slot while this form sits open, so keep what's
  // free up to date rather than only at the moment the date was picked.
  useAutoRefresh(() => loadSlots(true));

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
    <div className="space-y-4 w-full max-w-5xl">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground">Book Appointment</h1>
          <p className="text-sm text-muted-foreground">Schedule your next dental visit</p>
        </div>
        {chosen.length > 0 && (
          <Badge variant="outline" className="gap-1.5 bg-secondary/60 whitespace-nowrap">
            <Clock3 className="w-3.5 h-3.5" /> About {formatDuration(visitMinutes)} in the chair
          </Badge>
        )}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* What and who — one row, with the chosen services as chips beside the picker
              so adding several doesn't push the rest of the form down. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service</Label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-56">
                  {/* Always shows its placeholder: picking an option adds to the list beside
                      it rather than replacing a single selection. */}
                  <Select
                    value=""
                    disabled={remaining.length === 0}
                    onValueChange={(v) => setChosen(prev => [...prev, v])}
                  >
                    <SelectTrigger className="h-9" aria-label="Add a service">
                      <SelectValue placeholder={
                        remaining.length === 0 ? "All services added"
                          : chosen.length === 0 ? "Choose a service"
                          : "Add another service"
                      } />
                    </SelectTrigger>
                    <SelectContent>{remaining.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {chosen.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Add as many as you need.</span>
                ) : (
                  chosen.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1 py-0.5 pl-2.5 pr-1 font-normal">
                      {s}
                      <button
                        type="button"
                        aria-label={`Remove ${s}`}
                        className="rounded-full p-0.5 hover:bg-foreground/10"
                        onClick={() => setChosen(prev => prev.filter(c => c !== s))}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dentist</Label>
              <div className="w-full sm:w-64">
                <Select
                  value={dentistId}
                  disabled={chosen.length === 0 || loadingDentists}
                  onValueChange={(val) => { setDentistId(val); setDate(undefined); setTime(""); }}
                >
                  <SelectTrigger className="h-9" aria-label="Choose a dentist">
                    <SelectValue placeholder={chosen.length === 0 ? "Select a service first" : loadingDentists ? "Loading dentists..." : "Choose a dentist"} />
                  </SelectTrigger>
                  <SelectContent>
                    {dentists.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground min-h-4 leading-tight">
                {!loadingDentists && dentists.length === 0 ? (
                  <span className="text-destructive">No dentists are available for booking right now.</span>
                ) : loadingSchedule ? "Loading schedule..."
                  : dentistId && schedule && schedule.days.length === 0 ? (
                    <span className="text-destructive">This dentist has no working schedule configured yet.</span>
                  ) : schedule && schedule.days.length > 0 ? `Working hours: ${scheduleSummary}` : ""}
              </p>
            </div>
          </div>

          {/* When — the month and the free times side by side, so picking a day and seeing
              what is left is one glance rather than two dropdowns. */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-4 border-t pt-4">
            <div className={cn("rounded-md border w-fit", !dentistId && "opacity-60")}>
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => { setDate(d); setTime(""); }}
                className="p-2 pointer-events-auto"
                disabled={(d) => {
                  if (d < manilaTodayAsLocalDate()) return true;
                  if (!schedule) return true;
                  return !isDentistAvailableOn(schedule, d);
                }}
              />
            </div>

            <div className="space-y-2 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs text-muted-foreground">
                  {date ? `Times on ${format(date, "EEE, MMM d")}` : "Available times"}
                </Label>
                {dentistId && date && !loadingSlots && slots.length > 0 && (
                  <span className="text-xs text-muted-foreground">{slots.length} free</span>
                )}
              </div>

              {!dentistId || !date ? (
                <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
                  {chosen.length === 0 ? "Choose a service to begin."
                    : !dentistId ? "Choose a dentist to see their calendar."
                    : "Pick a date to see the free times."}
                </p>
              ) : loadingSlots ? (
                <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading times...
                </p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-destructive py-6 text-center border border-dashed rounded-md">
                  Fully booked that day — please pick another date.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Available time slots"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1"
                >
                  {slots.map(s => (
                    <Button
                      key={s.value}
                      type="button"
                      size="sm"
                      variant={time === s.value ? "default" : "outline"}
                      aria-pressed={time === s.value}
                      className={cn("h-9 justify-center font-normal text-xs whitespace-nowrap",
                        time === s.value && "gradient-primary text-primary-foreground")}
                      onClick={() => setTime(s.value)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {time
                ? `${serviceLabel} with ${dentist} on ${date ? format(date, "PPP") : ""} at ${selectedLabel}.`
                : <>Requests are submitted as <span className="text-warning font-medium">Pending</span> and need admin approval.</>}
            </p>
            <Button
              className="gradient-primary text-primary-foreground sm:w-auto shrink-0"
              disabled={chosen.length === 0 || !dentistId || !date || !time || submitting}
              onClick={handleSubmit}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-2" />}
              Confirm Appointment
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
