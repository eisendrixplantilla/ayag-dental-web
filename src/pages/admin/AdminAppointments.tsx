import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, UserPlus, Trash2, CalendarIcon, Loader2, Printer, Search, Check, ChevronsUpDown, X } from "lucide-react";
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Walk-in Appointments</h1>
          <p className="text-muted-foreground">Register and manage walk-in patients</p>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Plus className="w-5 h-5 text-primary" /> New Walk-in Appointment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Patient Name</Label>
              <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={patientPickerOpen}
                    className="w-full justify-between font-normal"
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
            <div>
              <Label>Service</Label>
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
                disabled={!patientName || remaining.length === 0}
                onValueChange={(v) => setChosen(prev => [...prev, v])}
              >
                <SelectTrigger className="mt-2" aria-label="Add a service">
                  <SelectValue placeholder={
                    !patientName ? "Enter patient name first"
                      : remaining.length === 0 ? "All services added"
                      : chosen.length === 0 ? "Select service"
                      : "Add another service"
                  } />
                </SelectTrigger>
                <SelectContent>{remaining.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {chosen.length === 0
                  ? "Add as many services as this visit needs."
                  : `About ${formatDuration(visitMinutes)} in the chair — only slots with that much free time are offered.`}
              </p>
            </div>
          </div>

          <div>
            <Label className="font-semibold">Assign Dentist</Label>
            <Select
              value={dentistId}
              disabled={chosen.length === 0 || loadingDentists}
              onValueChange={(val) => { setDentistId(val); setDate(undefined); setTime(""); }}
            >
              <SelectTrigger aria-label="Assign dentist"><SelectValue placeholder={chosen.length === 0 ? "Select a service first" : loadingDentists ? "Loading dentists..." : "Select dentist"} /></SelectTrigger>
              <SelectContent>{dentists.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            {!loadingDentists && dentists.length === 0 && (
              <p className="text-xs text-destructive mt-1">No dentists are available.</p>
            )}
            {loadingSchedule && <p className="text-xs text-muted-foreground mt-1">Loading schedule...</p>}
            {!loadingSchedule && schedule && schedule.days.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Working hours: {scheduleSummary}</p>
            )}
            {!loadingSchedule && dentistId && schedule && schedule.days.length === 0 && (
              <p className="text-xs text-destructive mt-1">This dentist has no working schedule configured yet.</p>
            )}
          </div>

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

            <div>
              <Label className="font-semibold">Available Time Slot</Label>
              <Select value={time} onValueChange={setTime} disabled={!dentistId || !date || loadingSlots || slots.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={!dentistId || !date ? "Select dentist and date first" : loadingSlots ? "Loading slots..." : slots.length === 0 ? "No slots available" : "Choose a time slot"} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {dentistId && date && !loadingSlots && slots.length === 0 && (
                <p className="text-sm text-destructive mt-2">No available appointment slots for the selected date.</p>
              )}
              {dentistId && date && !loadingSlots && slots.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {slots.length} slot{slots.length > 1 ? "s" : ""} available for {dentist}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Walk-in appointments are created by the clinic and are automatically{" "}
            <span className="text-success font-medium">Confirmed</span> — no approval needed.
          </p>

          <Button className="w-full gradient-primary text-primary-foreground" disabled={!patientName || chosen.length === 0 || !dentistId || !date || !time || saving} onClick={handleAdd}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} Add Walk-in Appointment
          </Button>
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
