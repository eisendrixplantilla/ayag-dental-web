import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, UserPlus, Trash2, CalendarIcon, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { getAppointments, createAppointment, deleteAppointment, type Appointment } from "@/lib/api/appointments";
import {
  getDentistDirectory, getDentistSchedule, generateAvailableSlots, isDentistAvailableOn,
  DAY_NAMES, type DentistDirectoryEntry, type DentistScheduleData,
} from "@/lib/api/staff";

const services = [
  "Orthodontics (Braces)", "EXO (Bunot)", "Restoration", "Oral", "Venners",
  "Denture (Pustiso)", "Implant", "Surgery", "TMJ", "Root Canal",
  "Teeth Whitening", "Fixed Bridge",
];

const ACTIVE_STATUSES = new Set(["confirmed", "pending", "rescheduled"]);

export default function AdminAppointments() {
  const [patientName, setPatientName] = useState("");
  const [service, setService] = useState("");
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

  const dentist = dentists.find((d) => d.id === dentistId)?.name ?? "";

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
    getAppointments({ dentistId, date: toKey(date) })
      .then((appts) => {
        const booked = appts.filter((a) => ACTIVE_STATUSES.has(a.status)).map((a) => a.time);
        setSlots(generateAvailableSlots(schedule, date, booked));
      })
      .catch(() => toast.error("Failed to load available time slots"))
      .finally(() => setLoadingSlots(false));
  }, [dentistId, date, schedule]);

  const scheduleSummary = useMemo(() => {
    if (!schedule || schedule.days.length === 0) return "";
    return [...schedule.days]
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((d) => `${DAY_NAMES[d.dayOfWeek].slice(0, 3)} ${toLabel(toMinutes(d.start))}–${toLabel(toMinutes(d.end))}`)
      .join(", ");
  }, [schedule]);

  const load = () => {
    setLoading(true);
    getAppointments({ type: "walk-in" })
      .then(setWalkIns)
      .catch(() => toast.error("Failed to load walk-in appointments"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!patientName || !service || !dentistId || !date || !time) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await createAppointment({
        patientName,
        dentistId,
        dentistName: dentist,
        service,
        date: toKey(date),
        time,
        type: "walk-in",
      });
      setPatientName(""); setService(""); setDentistId(""); setDate(undefined); setTime("");
      toast.success("Walk-in appointment confirmed!");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add walk-in appointment");
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
          <p className="text-xs">Walk-in Appointments · Generated {new Date().toLocaleDateString()}</p>
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
              <Input placeholder="Enter patient name" value={patientName} onChange={e => setPatientName(e.target.value)} />
            </div>
            <div>
              <Label>Service</Label>
              <Select
                value={service}
                disabled={!patientName}
                onValueChange={(v) => { setService(v); setDentistId(""); setDate(undefined); setTime(""); }}
              >
                <SelectTrigger><SelectValue placeholder={patientName ? "Select service" : "Enter patient name first"} /></SelectTrigger>
                <SelectContent>{services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="font-semibold">Assign Dentist</Label>
            <Select
              value={dentistId}
              disabled={!service || loadingDentists}
              onValueChange={(val) => { setDentistId(val); setDate(undefined); setTime(""); }}
            >
              <SelectTrigger><SelectValue placeholder={!service ? "Select a service first" : loadingDentists ? "Loading dentists..." : "Select dentist"} /></SelectTrigger>
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
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (d < today) return true;
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

          <Button className="w-full gradient-primary text-primary-foreground" disabled={!patientName || !service || !dentistId || !date || !time || saving} onClick={handleAdd}>
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
                <TableRow key={w.id}>
                  <TableCell className="font-medium">{w.patientName}</TableCell>
                  <TableCell>{w.service}</TableCell>
                  <TableCell>{w.dentistName}</TableCell>
                  <TableCell>{w.date}</TableCell>
                  <TableCell>{toLabel(toMinutes(w.time))}</TableCell>
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
