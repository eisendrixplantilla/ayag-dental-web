import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, CalendarPlus, Clock3, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import BookingCalendar from "@/components/BookingCalendar";
import DentistPicker from "@/components/DentistPicker";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { getDentistProfiles, type DentistProfile } from "@/lib/api/booking";
import { toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { useAuth } from "@/contexts/AuthContext";
import { createAppointment } from "@/lib/api/appointments";
import { FALLBACK_SERVICES, SERVICE_SEPARATOR, endTimeFor, formatDuration, totalServiceMinutes } from "@/lib/services";
import { getServices } from "@/lib/api/dentalRecords";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { getBookedSlots } from "@/lib/api/appointments";
import {
  getDentistDirectory, getDentistSchedule, generateAvailableSlots, forServices, BOOKING_LEAD_MINUTES,
  DAY_NAMES, type DentistDirectoryEntry, type DentistScheduleData,
} from "@/lib/api/staff";
import Hint from "@/components/Hint";


export default function PatientBook() {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // One service per booking; another is booked straight after, with the same dentist.
  // Kept as a list because the calendar, slots and limits all take one.
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
  // Times today have to be an hour off; the time list says so, so a shorter list makes sense.
  const bookingToday = !!date && toKey(date) === manilaTodayDateStr();
  const [time, setTime] = useState("");
  // Stable, so the calendar can let go of a day that fills up without looping.
  const pickDate = useCallback((d: Date | undefined) => { setDate(d); setTime(""); }, []);
  // Bumped to re-fetch the free slots, e.g. after someone else took the chosen one.
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [dentists, setDentists] = useState<DentistDirectoryEntry[]>([]);
  const [loadingDentists, setLoadingDentists] = useState(true);
  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const dentist = dentists.find((d) => d.id === dentistId)?.name ?? "";
  // What each dentist offers. The dentist is chosen first, and the services list then
  // holds only what they do.
  const [profiles, setProfiles] = useState<DentistProfile[]>([]);
  useEffect(() => {
    getDentistProfiles().then((p) => setProfiles(Array.isArray(p) ? p : [])).catch(() => {/* every service stays offered */});
  }, []);
  const offeredBy = (id: string) => profiles.find((p) => p.id === id)?.services ?? null;
  const theirServices = dentistId && offeredBy(dentistId) ? services.filter((s) => offeredBy(dentistId)!.includes(s)) : services;

  // Changing dentist keeps only the services the new one also does.
  const chooseDentist = (id: string) => {
    const offers = offeredBy(id);
    setDentistId(id);
    setDate(undefined);
    setTime("");
    if (offers) setChosen((prev) => prev.filter((s) => offers.includes(s)));
  };
  const chooseService = (service: string) => { setChosen([service]); setDate(undefined); setTime(""); };
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
  // While this patient's own booking is being sent, and after it went through, the time
  // they picked is held by that booking: a refresh then would call it "just taken".
  const bookingRef = useRef(false);

  const loadSlots = useCallback((silent = false) => {
    if (!dentistId || !date || !schedule) { setSlots([]); return; }
    if (!silent) setLoadingSlots(true);
    getBookedSlots({ dentistId, dentistName: dentist, date: toKey(date) })
      .then((booked) => {
        if (silent && bookingRef.current) return;
        const free = generateAvailableSlots(forServices(schedule, chosen), date, booked, visitMinutes, BOOKING_LEAD_MINUTES);
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
  }, [dentistId, date, schedule, dentist, visitMinutes, chosen]);

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
    bookingRef.current = true;
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
      bookingRef.current = false;
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
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
            {/* Another service, usually on another day, with the same dentist already chosen. */}
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={() => {
                bookingRef.current = false;
                setSubmitted(false);
                setChosen([]);
                setDate(undefined);
                setTime("");
              }}
            >
              <CalendarPlus className="w-4 h-4 mr-2" /> Book another service with {dentist}
            </Button>
            <Button variant="outline" asChild>
              <Link to="/patient/appointments">Done</Link>
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground">Book Appointment</h1>
          <p className="text-sm text-muted-foreground">Schedule your next dental visit</p>
        </div>
        {chosen.length > 0 && (
          <Badge variant="outline" className="gap-1.5 bg-secondary/60 w-fit whitespace-nowrap">
            <Clock3 className="w-3.5 h-3.5" /> About {formatDuration(visitMinutes)} in the chair
          </Badge>
        )}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 sm:p-5 space-y-4">
          {/* Who, then what: the dentist first, so their days and what they offer are seen
              before anything else is picked; the services are then only theirs. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dentist</Label>
              <div className="w-full lg:w-64">
                <DentistPicker
                  value={dentist}
                  placeholder={loadingDentists ? "Loading dentists..." : "Choose a dentist"}
                  disabled={loadingDentists || dentists.length === 0}
                  services={chosen}
                  visitMinutes={visitMinutes}
                  selectedId={dentistId}
                  onChoose={chooseDentist}
                  recentFor="self"
                  leadMinutes={BOOKING_LEAD_MINUTES}
                />
              </div>
              {/* Which days exist at all on the calendar below — worth reading, so it
                  doesn't sit in hint grey. */}
              <Hint label={schedule && schedule.days.length > 0 ? scheduleSummary : undefined}>
                <p className="text-xs min-h-5 leading-tight">
                  {!loadingDentists && dentists.length === 0 ? (
                    <span className="font-medium text-destructive">No dentists are available for booking right now.</span>
                  ) : loadingSchedule ? <span className="text-muted-foreground">Loading schedule...</span>
                    : dentistId && schedule && schedule.days.length === 0 ? (
                      <span className="font-medium text-destructive">This dentist has no working schedule configured yet.</span>
                    ) : schedule && schedule.days.length > 0 ? (
                      <span className="flex items-start gap-1.5 text-foreground">
                        <Clock3 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                        <span className="line-clamp-2 sm:line-clamp-none">
                          <span className="font-semibold">Working hours:</span>{" "}
                          <span className="font-medium">{scheduleSummary}</span>
                        </span>
                      </span>
                    ) : <span className="text-muted-foreground">See each dentist's days and services before you choose.</span>}
                </p>
              </Hint>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service</Label>
              <div className="w-full lg:w-64">
                <Select value={chosen[0] ?? ""} disabled={!dentistId || theirServices.length === 0} onValueChange={chooseService}>
                  <SelectTrigger className="h-11 sm:h-9" aria-label="Choose a service">
                    <SelectValue placeholder={!dentistId ? "Choose a dentist first" : "Choose a service"} />
                  </SelectTrigger>
                  <SelectContent>{theirServices.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">One service per booking. You can book another right after.</p>
            </div>
          </div>

          {/* When — the month and the free times side by side, so picking a day and seeing
              what is left is one glance rather than two dropdowns. On a tablet,
              where the sidebar leaves too little room, the times go under the month. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] gap-4 border-t pt-4">
            <div className={cn("rounded-md border w-full max-w-[30rem] mx-auto lg:mx-0", !dentistId && "opacity-60")}>
              <BookingCalendar
                schedule={schedule}
                dentistId={dentistId || null}
                dentistName={dentist}
                services={chosen}
                visitMinutes={visitMinutes}
                leadMinutes={BOOKING_LEAD_MINUTES}
                selected={date}
                onSelect={pickDate}
              />
            </div>

            <div className="space-y-2 min-w-0">
              <div className="flex items-center justify-between gap-2">
                {/* The times below mean nothing without the day they are on. */}
                <Label className={cn("text-sm font-semibold", date ? "text-foreground" : "text-muted-foreground")}>
                  {date ? `Times on ${format(date, "EEE, MMM d")}` : "Available times"}
                </Label>
                {dentistId && date && !loadingSlots && slots.length > 0 && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20 whitespace-nowrap">
                    {slots.length} free
                  </Badge>
                )}
              </div>

              {!dentistId || !date ? (
                <p className="text-sm text-muted-foreground py-4 sm:py-6 px-3 text-center border border-dashed rounded-md">
                  {!dentistId ? "Choose a dentist to begin."
                    : chosen.length === 0 ? "Choose a service, then pick a date."
                    : "Pick a date to see the free times."}
                </p>
              ) : loadingSlots ? (
                <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading times...
                </p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-destructive py-6 text-center border border-dashed rounded-md">
                  {bookingToday ? "No more times today at least 1 hour from now — please pick another date."
                    : "Fully booked that day — please pick another date."}
                </p>
              ) : (
                <>
                {bookingToday && (
                  <p className="text-xs text-muted-foreground">Today's times start at least 1 hour from now, so you have time to get here.</p>
                )}
                <div
                  role="group"
                  aria-label="Available time slots"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2 lg:max-h-56 lg:overflow-y-auto lg:pr-1"
                >
                  {slots.map(s => (
                    <Button
                      key={s.value}
                      type="button"
                      size="sm"
                      variant={time === s.value ? "default" : "outline"}
                      aria-pressed={time === s.value}
                      className={cn("h-11 sm:h-9 px-2 justify-center font-normal text-[11px] sm:text-xs whitespace-nowrap",
                        time === s.value && "gradient-primary text-primary-foreground")}
                      onClick={() => setTime(s.value)}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-3">
            {/* The last thing read before Confirm: what is actually being booked. */}
            {time ? (
              <p className="flex items-start gap-2 min-w-0 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs sm:text-sm text-foreground">
                <CalendarCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold">{serviceLabel}</span> with{" "}
                  <span className="font-semibold">{dentist}</span> on{" "}
                  <span className="font-semibold">{date ? format(date, "PPP") : ""}</span> at{" "}
                  <span className="font-semibold">{selectedLabel}</span>.
                </span>
              </p>
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground">
                Pick a dentist, a service, a date and a time to continue.
              </p>
            )}
            <Button
              className="gradient-primary text-primary-foreground w-full sm:w-auto h-11 sm:h-10 shrink-0"
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
