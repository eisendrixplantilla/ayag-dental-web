import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, UserPlus, Trash2, Loader2, Printer, Search, Check, ChevronsUpDown, X, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { toKey, toLabel, toMinutes, formatTimeRange } from "@/lib/dentistSchedules";
import { getAppointments, getBookedSlots, createAppointment, deleteAppointment, type Appointment } from "@/lib/api/appointments";
import { getPatients, type Patient } from "@/lib/api/patients";
import {
  getDentistDirectory, getDentistSchedule, generateAvailableSlots, isDentistAvailableOn,
  DAY_NAMES, type DentistDirectoryEntry, type DentistScheduleData,
} from "@/lib/api/staff";
import { formatManilaDate, manilaTodayAsLocalDate } from "@/lib/formatDate";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { FALLBACK_SERVICES, SERVICE_SEPARATOR, endTimeFor, formatDuration, totalServiceMinutes } from "@/lib/services";
import { getServices } from "@/lib/api/dentalRecords";
import { usePrintDocument } from "@/hooks/usePrintDocument";


export default function AdminAppointments() {
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
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
  const [walkIns, setWalkIns] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dentists, setDentists] = useState<DentistDirectoryEntry[]>([]);
  const [loadingDentists, setLoadingDentists] = useState(true);
  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [slots, setSlots] = useState<{ value: string; label: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  // Bumped to re-fetch the free slots, e.g. after someone else took the chosen one.
  const [slotsVersion, setSlotsVersion] = useState(0);

  const dentist = dentists.find((d) => d.id === dentistId)?.name ?? "";
  const serviceLabel = chosen.join(SERVICE_SEPARATOR);
  const selectedLabel = slots.find((s) => s.value === time)?.label ?? "";
  const remaining = services.filter((s) => !chosen.includes(s));

  // Arrived here from a notification bell click — scroll to that walk-in's row.
  const { highlightedKey, registerRow } = useNotificationJump(
    useCallback((id: string) => walkIns.find(w => w.id === id)?.id, [walkIns]),
  );

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
    getPatients().then(setPatients).catch(() => {});
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

  // `silent` is for background refreshes: no spinner over the table and no error
  // toast, so polling is invisible unless something actually changed.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    getAppointments({ type: "walk-in" })
      .then(setWalkIns)
      .catch(() => { if (!silent) toast.error("Failed to load walk-in appointments"); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => load(), []);
  // Pick up changes made by other people without needing a manual page refresh.
  useAutoRefresh(() => load(true));

  const handleAdd = async () => {
    if (!patientName || chosen.length === 0 || !dentistId || !date || !time) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await createAppointment({
        patientId: patientId || undefined,
        patientName,
        dentistId,
        dentistName: dentist,
        service: chosen.join(SERVICE_SEPARATOR),
        date: toKey(date),
        time,
        endTime: endTimeFor(time, visitMinutes),
        type: "walk-in",
      });
      setPatientName(""); setPatientId(""); setChosen([]); setDentistId(""); setDate(undefined); setTime("");
      toast.success("Walk-in appointment confirmed!");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add walk-in appointment");
      // Most likely the slot was taken in the meantime: show what's actually free now.
      setTime("");
      setSlotsVersion((v) => v + 1);
    } finally {
      setSaving(false);
    }
  };

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Walk-in Appointments Report",
      columns: ["Patient", "Service", "Dentist", "Date", "Time", "Status"],
      rows: walkIns.map(w => [
        w.patientName,
        w.service,
        w.dentistName ?? "—",
        w.date,
        formatTimeRange(w.time, w.endTime),
        w.status,
      ]),
    });

  const handleRemove = async (id: string) => {
    try {
      await deleteAppointment(id);
      toast.success("Removed");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove appointment");
    }
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Walk-in Appointments · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground">Walk-in Appointments</h1>
          <p className="text-sm text-muted-foreground">Register and manage walk-in patients</p>
        </div>
        <div className="flex items-center gap-2">
          {chosen.length > 0 && (
            <Badge variant="outline" className="gap-1.5 bg-secondary/60 w-fit whitespace-nowrap">
              <Clock3 className="w-3.5 h-3.5" /> About {formatDuration(visitMinutes)} in the chair
            </Badge>
          )}
          <Button onClick={handlePrint} variant="outline" size="sm" className="print:hidden">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        </div>
      </div>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> New Walk-in Appointment
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Patient Name</Label>
              <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={patientPickerOpen}
                    className="h-11 sm:h-9 w-full justify-between font-normal"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                      {patientName || "Enter or search patient name"}
                    </span>
                    <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput
                      placeholder="Type a name..."
                      value={patientName}
                      onValueChange={(v) => { setPatientName(v); setPatientId(""); }}
                    />
                    <CommandList>
                      <CommandEmpty>No matching patient account.</CommandEmpty>
                      <CommandGroup heading="Existing patients">
                        {patients.map(p => (
                          <CommandItem
                            key={p.id}
                            value={p.name}
                            onSelect={() => {
                              setPatientName(p.name);
                              setPatientId(p.id);
                              setPatientPickerOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 w-4 h-4", patientId === p.id ? "opacity-100" : "opacity-0")} />
                            {p.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    {/* Walk-ins are often for people with no account at all, so the typed
                        name has to be confirmable on its own. This sits outside CommandList
                        so cmdk's filtering can never hide it. */}
                    {patientName.trim() && !patients.some(p => p.name.trim().toLowerCase() === patientName.trim().toLowerCase()) && (
                      <div className="border-t border-border p-1">
                        <button
                          type="button"
                          onClick={() => { setPatientId(""); setPatientPickerOpen(false); }}
                          className="w-full flex items-center rounded-sm px-2 py-2 text-sm text-left hover:bg-accent"
                        >
                          <UserPlus className="mr-2 w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">Use "{patientName.trim()}" — no account</span>
                        </button>
                      </div>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
              {patientId ? (
                <p className="text-xs text-muted-foreground mt-1">Linked to existing patient account — will appear in their full history.</p>
              ) : patientName.trim() ? (
                <p className="text-xs text-muted-foreground mt-1">Guest walk-in — no patient account linked.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Service</Label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-56">
                  {/* Always shows its placeholder: picking an option adds to the list beside
                      it rather than replacing a single selection. */}
                  <Select
                    value=""
                    disabled={!patientName || remaining.length === 0}
                    onValueChange={(v) => setChosen(prev => [...prev, v])}
                  >
                    <SelectTrigger className="h-11 sm:h-9" aria-label="Add a service">
                      <SelectValue placeholder={
                        !patientName ? "Enter patient name first"
                          : remaining.length === 0 ? "All services added"
                          : chosen.length === 0 ? "Select service"
                          : "Add another service"
                      } />
                    </SelectTrigger>
                    <SelectContent>{remaining.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {chosen.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Add as many as this visit needs.</span>
                ) : (
                  chosen.map(s => (
                    <Badge key={s} variant="secondary" className="gap-1 py-1 pl-3 pr-1.5 font-normal max-w-full">
                      <span className="truncate">{s}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${s}`}
                        className="rounded-full p-1 -mr-0.5 hover:bg-foreground/10 shrink-0"
                        onClick={() => setChosen(prev => prev.filter(c => c !== s))}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Assign Dentist</Label>
            <div className="w-full sm:w-64">
              <Select
                value={dentistId}
                disabled={chosen.length === 0 || loadingDentists}
                onValueChange={(val) => { setDentistId(val); setDate(undefined); setTime(""); }}
              >
                <SelectTrigger className="h-11 sm:h-9" aria-label="Assign dentist"><SelectValue placeholder={chosen.length === 0 ? "Select a service first" : loadingDentists ? "Loading dentists..." : "Select dentist"} /></SelectTrigger>
                <SelectContent>{dentists.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground min-h-4 leading-tight line-clamp-2 sm:line-clamp-none"
               title={schedule && schedule.days.length > 0 ? scheduleSummary : undefined}>
              {!loadingDentists && dentists.length === 0 ? (
                <span className="text-destructive">No dentists are available.</span>
              ) : loadingSchedule ? "Loading schedule..."
                : dentistId && schedule && schedule.days.length === 0 ? (
                  <span className="text-destructive">This dentist has no working schedule configured yet.</span>
                ) : schedule && schedule.days.length > 0 ? `Working hours: ${scheduleSummary}` : ""}
            </p>
          </div>

          {/* When — the month and the free times side by side, so picking a day and seeing
              what is left at the desk is one glance rather than two dropdowns. */}
          <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-4 border-t pt-4">
            <div className={cn("rounded-md border w-fit max-w-full overflow-x-auto mx-auto md:mx-0", !dentistId && "opacity-60")}>
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
                <p className="text-sm text-muted-foreground py-4 sm:py-6 px-3 text-center border border-dashed rounded-md">
                  {!patientName ? "Enter the patient's name to begin."
                    : chosen.length === 0 ? "Add a service to begin."
                    : !dentistId ? "Assign a dentist to see their calendar."
                    : "Pick a date to see the free times."}
                </p>
              ) : loadingSlots ? (
                <p className="text-sm text-muted-foreground py-4 sm:py-6 text-center border border-dashed rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading times...
                </p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-destructive py-4 sm:py-6 px-3 text-center border border-dashed rounded-md">
                  Fully booked that day — please pick another date.
                </p>
              ) : (
                <div
                  role="group"
                  aria-label="Available time slots"
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:max-h-56 md:overflow-y-auto md:pr-1"
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
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              {time
                ? `${serviceLabel} with ${dentist} on ${date ? format(date, "PPP") : ""} at ${selectedLabel}.`
                : <>Walk-ins are created by the clinic and are automatically <span className="text-success font-medium">Confirmed</span> — no approval needed.</>}
            </p>
            <Button
              className="gradient-primary text-primary-foreground w-full sm:w-auto h-11 sm:h-10 shrink-0"
              disabled={!patientName || chosen.length === 0 || !dentistId || !date || !time || saving}
              onClick={handleAdd}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} Add Walk-in
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" /> Walk-in Appointments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Dentist</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {walkIns.map(w => (
                <TableRow
                  key={w.id}
                  ref={registerRow(w.id)}
                  className={highlightedKey === w.id ? HIGHLIGHT_ROW_CLASS : undefined}
                >
                  <TableCell className="font-medium">{w.patientName}</TableCell>
                  <TableCell>{w.service}</TableCell>
                  <TableCell>{w.dentistName}</TableCell>
                  <TableCell>{w.date}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatTimeRange(w.time, w.endTime)}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-success/10 text-success border-success/20">{w.status}</Badge></TableCell>
                  <TableCell className="print:hidden">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemove(w.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {walkIns.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No walk-in appointments yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
