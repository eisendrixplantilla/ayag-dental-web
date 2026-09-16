import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarPlus, Clock3, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const services = [
  "Orthodontics (Braces)",
  "EXO (Bunot)",
  "Restoration",
  "Oral",
  "Venners",
  "Denture (Pustiso)",
  "Implant",
  "Surgery",
  "TMJ",
  "Root Canal",
  "Teeth Whitening",
  "Fixed Bridge",
];

interface DentistSchedule {
  name: string;
  workingDays: number[]; // 0 = Sunday
  start: string; // "09:00"
  end: string; // "17:00"
  lunchStart: string;
  lunchEnd: string;
  duration: number; // minutes per appointment
  maxPatientsPerDay: number;
  leave: string[]; // yyyy-MM-dd
  booked: Record<string, string[]>; // yyyy-MM-dd -> ["09:00", ...] confirmed appointments
}

const toKey = (d: Date) => format(d, "yyyy-MM-dd");
const dayKey = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toKey(d);
};

const dentistSchedules: DentistSchedule[] = [
  {
    name: "Dr. Ayag",
    workingDays: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "17:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    duration: 30,
    maxPatientsPerDay: 10,
    leave: [dayKey(3)],
    booked: { [dayKey(1)]: ["09:00", "09:30", "13:00"] },
  },
  {
    name: "Dr. Santos",
    workingDays: [1, 3, 5],
    start: "10:00",
    end: "16:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    duration: 30,
    maxPatientsPerDay: 6,
    leave: [],
    booked: { [dayKey(2)]: ["10:00", "10:30"] },
  },
  {
    name: "Dr. Reyes",
    workingDays: [2, 4, 6],
    start: "09:00",
    end: "15:00",
    lunchStart: "11:30",
    lunchEnd: "12:30",
    duration: 45,
    maxPatientsPerDay: 5,
    leave: [dayKey(5)],
    booked: {},
  },
  {
    name: "Dr. Cruz",
    workingDays: [1, 2, 3, 4, 5, 6],
    start: "08:00",
    end: "14:00",
    lunchStart: "11:00",
    lunchEnd: "12:00",
    duration: 60,
    maxPatientsPerDay: 4,
    leave: [],
    booked: { [dayKey(1)]: ["08:00"] },
  },
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
const toValue = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

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
    if (t < lunchEnd && slotEnd > lunchStart) continue; // lunch break overlap
    const value = toValue(t);
    if (booked.includes(value)) continue;
    if (isToday && t <= nowMinutes) continue;
    slots.push({ value, label: toLabel(t) });
  }

  return slots.slice(0, remaining);
}

export default function PatientBook() {
  const [submitted, setSubmitted] = useState(false);
  const [service, setService] = useState("");
  const [dentist, setDentist] = useState("");
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState("");

  const schedule = dentistSchedules.find((d) => d.name === dentist);
  const slots = useMemo(() => generateSlots(schedule, date), [schedule, date]);
  const selectedLabel = slots.find((s) => s.value === time)?.label ?? "";

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
            {service} on {date ? format(date, "PPP") : ""} at {selectedLabel} with {dentist}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Your request is not confirmed yet. You will be notified once the clinic admin approves it.
          </p>
          <Button
            className="mt-6 gradient-primary text-primary-foreground"
            onClick={() => {
              setSubmitted(false);
              setService("");
              setDentist("");
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
          {/* Step 1: Service */}
          <div>
            <Label>Select Service</Label>
            <Select
              value={service}
              onValueChange={(v) => { setService(v); setDentist(""); setDate(undefined); setTime(""); }}
            >
              <SelectTrigger><SelectValue placeholder="Choose a service" /></SelectTrigger>
              <SelectContent>{services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Step 2: Dentist */}
          <div>
            <Label className="font-semibold">Select Dentist</Label>
            <Select
              value={dentist}
              disabled={!service}
              onValueChange={(val) => { setDentist(val); setDate(undefined); setTime(""); }}
            >
              <SelectTrigger>
                <SelectValue placeholder={service ? "Choose a dentist" : "Select a service first"} />
              </SelectTrigger>
              <SelectContent>
                {dentistSchedules.map(d => <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {schedule && (
              <p className="text-xs text-muted-foreground mt-1">
                Working days: {schedule.workingDays.map(d => ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")} •{" "}
                {toLabel(toMinutes(schedule.start))}–{toLabel(toMinutes(schedule.end))} • {schedule.duration} min per visit
              </p>
            )}
          </div>

          {/* Step 3: Date */}
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

            {/* Step 4: Time slot */}
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
                <p className="text-sm text-destructive mt-2">
                  No available appointment slots for the selected date. Please choose another date.
                </p>
              )}
              {dentist && date && slots.length > 0 && (
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
            disabled={!service || !dentist || !date || !time}
            onClick={() => {
              setSubmitted(true);
              toast.success("Appointment request submitted — pending admin approval");
            }}
          >
            <CalendarPlus className="w-4 h-4 mr-2" />Confirm Appointment
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
