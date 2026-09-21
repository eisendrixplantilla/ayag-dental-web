import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell, CalendarPlus, CalendarCheck, CalendarClock, XCircle, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { formatManilaDateTime } from "@/lib/formatDate";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { format, parseISO } from "date-fns";

interface NotificationItem {
  id: string;
  title: string;
  icon: LucideIcon;
  colorClass: string;
  time: string;
}

function describe(apt: Appointment): { title: string; icon: LucideIcon; colorClass: string } {
  const when = `${format(parseISO(apt.date), "MMM d, yyyy")} at ${toLabel(toMinutes(apt.time))}`;
  switch (apt.status) {
    case "pending":
      return { title: `New booking request from ${apt.patientName} — ${apt.service}, ${when}`, icon: CalendarPlus, colorClass: "text-warning" };
    case "confirmed":
      return {
        title: apt.type === "walk-in"
          ? `Walk-in appointment added for ${apt.patientName} — ${apt.service}, ${when}`
          : `${apt.patientName}'s appointment was confirmed — ${apt.service}, ${when}`,
        icon: CalendarCheck, colorClass: "text-success",
      };
    case "rescheduled":
      return { title: `${apt.patientName}'s appointment was rescheduled to ${when}`, icon: CalendarClock, colorClass: "text-warning" };
    case "cancelled":
      return { title: `${apt.patientName} cancelled their appointment (${apt.service})`, icon: XCircle, colorClass: "text-destructive" };
    case "rejected":
      return { title: `${apt.patientName}'s appointment request was rejected`, icon: XCircle, colorClass: "text-destructive" };
    case "completed":
      return { title: `Consultation with ${apt.patientName} was completed`, icon: CheckCircle2, colorClass: "text-success" };
    default:
      return { title: `${apt.patientName}'s appointment was updated`, icon: CalendarClock, colorClass: "text-muted-foreground" };
  }
}

export function NotificationsBell() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    if (user?.role !== "dentist") return;
    getAppointments().then(setAppointments).catch(() => {});
  }, [user?.role]);

  const items: NotificationItem[] = useMemo(() => {
    if (user?.role !== "dentist") return [];
    return appointments
      .filter(a => a.dentistName === user.name)
      .map(a => ({ id: a.id, time: a.updatedAt, ...describe(a) }))
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 20);
  }, [appointments, user]);

  if (user?.role !== "dentist") return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          {items.length > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] leading-none">
              {items.length > 9 ? "9+" : items.length}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[28rem] overflow-y-auto bg-popover">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          items.map(n => (
            <div key={n.id} className="flex items-start gap-2 px-2 py-2 text-sm">
              <n.icon className={`w-4 h-4 mt-0.5 shrink-0 ${n.colorClass}`} />
              <div className="min-w-0">
                <p className="text-foreground leading-snug">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatManilaDateTime(n.time)}</p>
              </div>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
