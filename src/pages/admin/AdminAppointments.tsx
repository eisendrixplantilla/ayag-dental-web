import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, UserPlus, Trash2, CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { dentistSchedules, generateSlots, toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { getAppointments, createAppointment, deleteAppointment, type Appointment } from "@/lib/api/appointments";

const services = [
  "Orthodontics (Braces)", "EXO (Bunot)", "Restoration", "Oral", "Venners",
  "Denture (Pustiso)", "Implant", "Surgery", "TMJ", "Root Canal",
  "Teeth Whitening", "Fixed Bridge",
];

export default function AdminAppointments() {
  const [patientName, setPatientName] = useState("");
  const [service, setService] = useState("");
  const [dentist, setDentist] = useState("");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");
  const [walkIns, setWalkIns] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const schedule = dentistSchedules.find(d => d.name === dentist);
  const slots = useMemo(() => generateSlots(schedule, date), [schedule, date]);

  const load = () => {
    setLoading(true);
    getAppointments({ type: "walk-in" })
      .then(setWalkIns)
      .catch(() => toast.error("Failed to load walk-in appointments"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!patientName || !service || !dentist || !date || !time) {
      toast.error("Please fill in all required fields");
      return;
    }
    setSaving(true);
    try {
      await createAppointment({
        patientName,
        dentistName: dentist,
        service,
        date: toKey(date),
        time,
        type: "walk-in",
      });
      setPatientName(""); setService(""); setDentist(""); setDate(undefined); setTime("");
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
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Walk-in Appointments</h1>
        <p className="text-muted-foreground">Register and manage walk-in patients</p>
      </div>

      <Card className="shadow-card">
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
                onValueChange={(v) => { setService(v); setDentist(""); setDate(undefined); setTime(""); }}
              >
                <SelectTrigger><SelectValue placeholder={patientName ? "Select service" : "Enter patient name first"} /></SelectTrigger>
                <SelectContent>{services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="font-semibold">Assign Dentist</Label>
            <Select
              value={dentist}
              disabled={!service}
              onValueChange={(val) => { setDentist(val); setDate(undefined); setTime(""); }}
            >
              <SelectTrigger><SelectValue placeholder={service ? "Select dentist" : "Select a service first"} /></SelectTrigger>
              <SelectContent>{dentistSchedules.map(d => <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
            {schedule && (
              <p className="text-xs text-muted-foreground mt-1">
                Working days: {schedule.workingDays.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")} •{" "}
                {toLabel(toMinutes(schedule.start))}–{toLabel(toMinutes(schedule.end))} • {schedule.duration} min per visit
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Appointment Date</Label>
              <Popover>
                <PopoverTrigger asChild disabled={!dentist}>
                  <Button variant="outline" disabled={!dentist} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>{dentist ? "Pick a date" : "Select a dentist first"}</span>}
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
                      if (schedule.leave.includes(toKey(d))) return true;
                      return !schedule.workingDays.includes(d.getDay());
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label className="font-semibold">Available Time Slot</Label>
              <Select value={time} onValueChange={setTime} disabled={!dentist || !date || slots.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={!dentist || !date ? "Select dentist and date first" : slots.length === 0 ? "No slots available" : "Choose a time slot"} />
                </SelectTrigger>
                <SelectContent>
                  {slots.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {dentist && date && slots.length === 0 && (
                <p className="text-sm text-destructive mt-2">No available appointment slots for the selected date.</p>
              )}
              {dentist && date && slots.length > 0 && (
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

          <Button className="w-full gradient-primary text-primary-foreground" disabled={!patientName || !service || !dentist || !date || !time || saving} onClick={handleAdd}>
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
                <TableHead>Actions</TableHead>
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
                  <TableCell>
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
