import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, PIN_COL, CODE_COL } from "@/lib/tableClass";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck, CalendarDays, Plus, UserPlus, Trash2, Loader2, Printer, Search, Check, ChevronsUpDown, X, Clock3, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import BookingCalendar from "@/components/BookingCalendar";
import DentistPicker from "@/components/DentistPicker";
import { getDentistProfiles, type DentistProfile } from "@/lib/api/booking";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { toKey, toLabel, toMinutes, formatTimeRange } from "@/lib/dentistSchedules";
import { getAppointments, getBookedSlots, createAppointment, deleteAppointment, byNewestBooked, type Appointment } from "@/lib/api/appointments";
import { getPatients, type Patient } from "@/lib/api/patients";
import {
  getDentistDirectory, getDentistSchedule, generateAvailableSlots, forServices,
  DAY_NAMES, type DentistDirectoryEntry, type DentistScheduleData,
} from "@/lib/api/staff";
import { formatManilaDate, formatManilaStamp } from "@/lib/formatDate";
import { appointmentRef } from "@/lib/appointmentRef";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { FALLBACK_SERVICES, SERVICE_SEPARATOR, endTimeFor, formatDuration, totalServiceMinutes } from "@/lib/services";
import { getServices } from "@/lib/api/dentalRecords";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import SortableHead from "@/components/SortableHead";
import { useTableSort } from "@/hooks/useTableSort";
import MobileInput from "@/components/MobileInput";
import { cleanName, formatName, PH_MOBILE } from "@/lib/inputRules";
import Hint from "@/components/Hint";
import { IconAction, RowActions } from "@/components/RowActions";


// What the walk-in table shows, sorts by and prints.
const WALK_IN_COLUMNS = ["Patient", "Service", "Dentist", "Date", "Time", "Status"];
const walkInRow = (w: Appointment) => [
  w.patientName,
  w.service,
  w.dentistName ?? "—",
  w.date,
  formatTimeRange(w.time, w.endTime),
  w.status,
];

export default function AdminAppointments() {
  // Whether this walk-in is for someone with a patient account or a guest with none.
  // The account path is unchanged; the guest path collects the details below instead.
  const [mode, setMode] = useState<"account" | "guest">("account");
  const [patientName, setPatientName] = useState("");
  const [patientId, setPatientId] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  // Guest details — kept on the appointment itself, since no account is created.
  const [guestContact, setGuestContact] = useState("");
  const [guestAge, setGuestAge] = useState("");
  const [guestGender, setGuestGender] = useState("");
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
  // Stable, so the calendar can let go of a day that fills up without looping.
  const pickDate = useCallback((d: Date | undefined) => { setDate(d); setTime(""); }, []);
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
  // What each dentist offers. The dentist is chosen first, and the services list then
  // holds only what they do.
  const [profiles, setProfiles] = useState<DentistProfile[]>([]);
  useEffect(() => {
    getDentistProfiles().then((p) => setProfiles(Array.isArray(p) ? p : [])).catch(() => {/* every service stays offered */});
  }, []);
  const offeredBy = (id: string) => profiles.find((p) => p.id === id)?.services ?? null;
  const serviceLabel = chosen.join(SERVICE_SEPARATOR);
  const selectedLabel = slots.find((s) => s.value === time)?.label ?? "";
  const theirServices = dentistId && offeredBy(dentistId) ? services.filter((s) => offeredBy(dentistId)!.includes(s)) : services;
  // Set once a walk-in is added: the patient and dentist stay on the form, ready for
  // another service, until Done.
  const [justAdded, setJustAdded] = useState<{ what: string; who: string; dentist: string } | null>(null);
  // Changing dentist keeps only the services the new one also does.
  const chooseDentist = (id: string) => {
    const offers = offeredBy(id);
    setDentistId(id);
    setDate(undefined);
    setTime("");
    if (offers) setChosen((prev) => prev.filter((s) => offers.includes(s)));
  };
  const chooseService = (service: string) => { setChosen([service]); setDate(undefined); setTime(""); };
  const doneWithPatient = () => {
    resetPatient(); setChosen([]); setDentistId(""); setDate(undefined); setTime(""); setJustAdded(null);
  };

  const isGuest = mode === "guest";
  // A guest needs the essentials captured; an account walk-in needs an existing patient
  // actually selected (a linked id), not just a typed name.
  const guestReady = !!cleanName(patientName) && PH_MOBILE.test(guestContact) && !!guestAge.trim() && !!guestGender;
  const patientReady = isGuest ? guestReady : !!patientId;

  // Clear everything the patient section holds — used when switching modes and after a
  // walk-in is created, so no stale name/details leak across.
  const resetPatient = () => {
    setPatientName(""); setPatientId("");
    setGuestContact(""); setGuestAge(""); setGuestGender("");
  };
  const switchMode = (next: "account" | "guest") => {
    if (!next || next === mode) return;
    setMode(next);
    resetPatient();
  };

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
  // While a walk-in is being added, its own time is about to be held by it: a refresh
  // landing then would call it "just taken".
  const addingRef = useRef(false);

  const loadSlots = useCallback((silent = false) => {
    if (!dentistId || !date || !schedule) { setSlots([]); return; }
    if (!silent) setLoadingSlots(true);
    getBookedSlots({ dentistId, dentistName: dentist, date: toKey(date) })
      .then((booked) => {
        if (silent && addingRef.current) return;
        const free = generateAvailableSlots(forServices(schedule, chosen), date, booked, visitMinutes);
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
    if (!patientReady || chosen.length === 0 || !dentistId || !date || !time) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    addingRef.current = true;
    try {
      await createAppointment({
        patientId: isGuest ? undefined : (patientId || undefined),
        patientName: isGuest ? cleanName(patientName) : patientName.trim(),
        // Guest details ride along on the appointment; an account walk-in carries none.
        contact: isGuest ? guestContact : undefined,
        age: isGuest ? Number(guestAge) : undefined,
        gender: isGuest ? guestGender : undefined,
        dentistId,
        dentistName: dentist,
        service: chosen.join(SERVICE_SEPARATOR),
        date: toKey(date),
        time,
        endTime: endTimeFor(time, visitMinutes),
        type: "walk-in",
      });
      // The patient and dentist stay, so another service can be added straight away.
      setJustAdded({
        what: `${chosen.join(SERVICE_SEPARATOR)} on ${format(date, "EEE, MMM d")} at ${selectedLabel}`,
        who: isGuest ? cleanName(patientName) : patientName.trim(),
        dentist,
      });
      setChosen([]); setDate(undefined); setTime("");
      toast.success("Walk-in appointment confirmed!");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add walk-in appointment");
      // Most likely the slot was taken in the meantime: show what's actually free now.
      setTime("");
      setSlotsVersion((v) => v + 1);
    } finally {
      addingRef.current = false;
      setSaving(false);
    }
  };

  // Newest booking first, so a walk-in just taken at the desk is the top row — until a
  // column heading is clicked to sort by that instead.
  const booked = useMemo(() => [...walkIns].sort(byNewestBooked), [walkIns]);
  const { sorted: ordered, sortKey, headProps } = useTableSort(booked, walkInRow);
  const { page, setPage, paged } = usePagination(ordered, sortKey);

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Walk-in Appointments Report",
      columns: WALK_IN_COLUMNS,
      rows: ordered.map(walkInRow),
    });

  // Everything about a walk-in, including removing it, lives behind View — the same
  // one-way-in the online appointments list uses.
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [removing, setRemoving] = useState<Appointment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmRemove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await deleteAppointment(removing.id);
      toast.success("Walk-in appointment removed");
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove appointment");
    } finally {
      setDeleting(false);
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
          {justAdded && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-success/30 bg-success/10 px-3 py-2.5 text-sm">
              <p className="flex-1 min-w-0 text-foreground">
                <Check className="w-4 h-4 inline mr-1.5 -mt-0.5 text-success" />
                Added <span className="font-semibold">{justAdded.what}</span> for <span className="font-semibold">{justAdded.who}</span> with{" "}
                <span className="font-semibold">{justAdded.dentist}</span>. Choose another service below for the same patient, or finish.
              </p>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={doneWithPatient}>Done</Button>
            </div>
          )}
          {/* Who on the left, what and with whom on the right: on a wide screen the form
              fills the card instead of running down one narrow column. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
            <div className="space-y-4 min-w-0">
              {/* Who this walk-in is for: someone with a patient account, or a guest with
                  none. The account path is unchanged; the guest path collects details below. */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Does the patient have an account?</Label>
                <ToggleGroup
                  type="single"
                  value={mode}
                  onValueChange={(v) => switchMode(v as "account" | "guest")}
                  className="justify-start gap-2"
                >
                  <ToggleGroupItem
                    value="account"
                    aria-label="Patient has an account"
                    className="h-9 px-3 border data-[state=on]:gradient-primary data-[state=on]:text-primary-foreground data-[state=on]:border-transparent"
                  >
                    <Search className="w-4 h-4 mr-2" /> Has account
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="guest"
                    aria-label="Patient has no account"
                    className="h-9 px-3 border data-[state=on]:gradient-primary data-[state=on]:text-primary-foreground data-[state=on]:border-transparent"
                  >
                    <UserPlus className="w-4 h-4 mr-2" /> No account
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {isGuest ? (
                /* Guest: capture the essentials before booking, since nothing is stored under
                   an account. These ride along on the appointment record itself. */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-dashed p-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Full Name <span className="text-destructive">*</span></Label>
                    <Input
                      value={patientName}
                      onChange={(e) => setPatientName(formatName(e.target.value))}
                      onBlur={() => setPatientName(cleanName(patientName))}
                      autoCapitalize="words"
                      placeholder="Patient's full name"
                      className="h-11 sm:h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Contact Number <span className="text-destructive">*</span></Label>
                    <MobileInput
                      value={guestContact}
                      onValueChange={setGuestContact}
                      className="h-11 sm:h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Age <span className="text-destructive">*</span></Label>
                    <Input
                      value={guestAge}
                      onChange={(e) => setGuestAge(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                      inputMode="numeric"
                      placeholder="e.g. 32"
                      className="h-11 sm:h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Gender <span className="text-destructive">*</span></Label>
                    <Select value={guestGender} onValueChange={setGuestGender}>
                      <SelectTrigger className="h-11 sm:h-9" aria-label="Gender"><SelectValue placeholder="Select gender" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Guest walk-in — these details are saved on this appointment, not as a patient account.
                  </p>
                </div>
              ) : (
                /* Account: the existing-patient picker, unchanged. */
                <div className="space-y-1.5">
                  <Label className="block text-xs text-muted-foreground">Patient</Label>
                  <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={patientPickerOpen}
                        className="h-11 sm:h-9 w-full sm:max-w-md justify-between font-normal"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                          {patientName || "Search for a patient account"}
                        </span>
                        <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Type a name..." />
                        <CommandList>
                          <CommandEmpty>
                            No matching patient account. Switch to <span className="font-medium">No account</span> for a guest.
                          </CommandEmpty>
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
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {patientId && (
                    <p className="text-xs text-muted-foreground mt-1">Linked to existing patient account — will appear in their full history.</p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-4 min-w-0 lg:border-l lg:pl-8">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Assign Dentist</Label>
                <div className="w-full lg:w-64">
                  <DentistPicker
                    label="Assign dentist"
                    value={dentist}
                    placeholder={!patientReady ? (isGuest ? "Fill in the patient details first" : "Select a patient first")
                      : loadingDentists ? "Loading dentists..." : "Select dentist"}
                    disabled={!patientReady || loadingDentists || dentists.length === 0}
                    services={chosen}
                    visitMinutes={visitMinutes}
                    selectedId={dentistId}
                    onChoose={chooseDentist}
                    recentFor={isGuest ? undefined : patientId || undefined}
                  />
                </div>
                {/* Which days exist at all on the calendar below — worth reading, so it
                    doesn't sit in hint grey. */}
                <Hint label={schedule && schedule.days.length > 0 ? scheduleSummary : undefined}>
                  <p className="text-xs min-h-5 leading-tight">
                    {!loadingDentists && dentists.length === 0 ? (
                      <span className="font-medium text-destructive">No dentists are available.</span>
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
                      ) : ""}
                  </p>
                </Hint>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Service</Label>
                <div className="w-full lg:w-64">
                  <Select value={chosen[0] ?? ""} disabled={!patientReady || !dentistId || theirServices.length === 0} onValueChange={chooseService}>
                    <SelectTrigger className="h-11 sm:h-9" aria-label="Choose a service">
                      <SelectValue placeholder={
                        !patientReady ? (isGuest ? "Fill in the patient details first" : "Select a patient first")
                          : !dentistId ? "Choose a dentist first"
                          : "Select service"
                      } />
                    </SelectTrigger>
                    <SelectContent>{theirServices.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">One service per walk-in. Add another right after.</p>
              </div>
            </div>
          </div>

          {/* When — the month and the free times side by side, so picking a day and seeing
              what is left at the desk is one glance rather than two dropdowns. On a tablet,
              where the sidebar leaves too little room, the times go under the month. */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] gap-4 border-t pt-4">
            <div className={cn("rounded-md border w-full max-w-[30rem] mx-auto lg:mx-0", !dentistId && "opacity-60")}>
              <BookingCalendar
                schedule={schedule}
                dentistId={dentistId || null}
                dentistName={dentist}
                services={chosen}
                visitMinutes={visitMinutes}
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
                  {!patientReady ? (isGuest ? "Fill in the patient's details to begin." : "Select a patient to begin.")
                    : !dentistId ? "Assign a dentist to see their calendar."
                    : chosen.length === 0 ? "Add a service, then pick a date."
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
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t pt-3">
            {/* The last thing read before the walk-in is created: what it actually says. */}
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
                Walk-ins are created by the clinic and are automatically{" "}
                <span className="font-medium text-success">Confirmed</span> — no approval needed.
              </p>
            )}
            <Button
              className="gradient-primary text-primary-foreground w-full sm:w-auto h-11 sm:h-10 shrink-0"
              disabled={!patientReady || chosen.length === 0 || !dentistId || !date || !time || saving}
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
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <SortableHead {...headProps(0)} className={PIN_COL}>Patient</SortableHead>
                <SortableHead {...headProps(1)}>Service</SortableHead>
                <SortableHead {...headProps(2)}>Dentist</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(3)}>Date</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(4)}>Time</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(5)}>Status</SortableHead>
                <TableHead className={`print:hidden ${CODE_COL}`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(w => (
                <TableRow
                  key={w.id}
                  ref={registerRow(w.id)}
                  className={highlightedKey === w.id ? HIGHLIGHT_ROW_CLASS : undefined}
                >
                  <TableCell className={`font-medium whitespace-normal break-words ${PIN_COL}`}>{w.patientName}</TableCell>
                  <TableCell className="whitespace-normal break-words">{w.service}</TableCell>
                  <TableCell className="whitespace-normal break-words">{w.dentistName}</TableCell>
                  <TableCell className={CODE_COL}>{w.date}</TableCell>
                  <TableCell className={`whitespace-nowrap ${CODE_COL}`}>{formatTimeRange(w.time, w.endTime)}</TableCell>
                  <TableCell className={CODE_COL}><Badge variant="outline" className="bg-success/10 text-success border-success/20">{w.status}</Badge></TableCell>
                  <TableCell className={`print:hidden ${CODE_COL}`}>
                    <RowActions>
                      <IconAction label="View details" icon={Eye} onClick={() => setViewing(w)} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
              {ordered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No walk-in appointments yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          )}
        <TablePagination
          page={page}
          onPageChange={setPage}
          total={ordered.length}
          pageSize={PAGE_SIZE}
          noun="walk-in(s)"
        />
        </CardContent>
      </Card>

      {/* Details, with Remove behind it */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-md bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Walk-in Appointment</DialogTitle>
            <DialogDescription>{viewing ? appointmentRef(viewing) : ""}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <DetailRow label="Patient" value={viewing.patientName} />
              {viewing.contact && <DetailRow label="Contact" value={viewing.contact} />}
              {viewing.email && <DetailRow label="Email" value={viewing.email} />}
              {viewing.age != null && <DetailRow label="Age" value={String(viewing.age)} />}
              {viewing.gender && <DetailRow label="Gender" value={viewing.gender} />}
              <DetailRow label="Service" value={viewing.service} />
              <DetailRow label="Dentist" value={viewing.dentistName ?? "—"} />
              <DetailRow label="Date" value={viewing.date} />
              <DetailRow label="Time" value={formatTimeRange(viewing.time, viewing.endTime)} />
              <DetailRow label="Status" value={viewing.status} />
              <DetailRow label="Booked On" value={formatManilaStamp(viewing.createdAt)} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            <Button
              variant="destructive"
              onClick={() => { setRemoving(viewing); setViewing(null); }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Removing is permanent, so it is confirmed rather than done on one click. */}
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Remove this walk-in?</DialogTitle>
            <DialogDescription>
              {removing && `${removing.patientName} — ${removing.service} on ${removing.date} at ${formatTimeRange(removing.time, removing.endTime)}.`}
              {" "}This deletes the appointment for good and frees the time slot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
  );
}
