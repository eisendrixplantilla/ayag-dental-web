import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bell, CalendarPlus, CalendarCheck, CalendarClock, XCircle, CheckCheck, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { formatManilaDateTime } from "@/lib/formatDate";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { format, parseISO } from "date-fns";

const READ_STORAGE_PREFIX = "notifications:read:";

interface NotificationItem {
  id: string;
  title: string;
  icon: LucideIcon;
  colorClass: string;
  time: string;
  route: string;
}

/**
 * Read state is tracked per appointment *update*, not per appointment — if an
 * appointment changes again after being read, that's genuinely new and should
 * light the badge back up.
 */
const keyOf = (n: NotificationItem) => `${n.id}:${n.time}`;

function loadReadKeys(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_PREFIX + userId);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

// A finished consultation lives in Dental Records; everything else is still an
// appointment, so it belongs in My Appointments.
function routeFor(apt: Appointment): string {
  return apt.status === "completed" ? "/dentist/records" : "/dentist/appointments";
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
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [open, setOpen] = useState(false);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  const refresh = () => {
    if (user?.role !== "dentist") return;
    getAppointments().then(setAppointments).catch(() => {});
  };

  // Initial load, plus periodic refresh so the count/list don't go stale while the
  // dropdown sits closed and other tabs/pages change appointment statuses.
  useEffect(() => {
    refresh();
    if (user?.role !== "dentist") return;
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [user?.role]);

  // Read state is per account, and the user isn't known on the very first render.
  useEffect(() => {
    if (user?.id) setReadKeys(loadReadKeys(user.id));
  }, [user?.id]);

  const items: NotificationItem[] = useMemo(() => {
    if (user?.role !== "dentist") return [];
    return appointments
      .filter(a => a.dentistName === user.name)
      .map(a => ({ id: a.id, time: a.updatedAt, route: routeFor(a), ...describe(a) }))
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 20);
  }, [appointments, user]);

  // Persist, pruned to what's still on the list so the entry never grows unbounded.
  // Guarded on items.length so the pre-load empty render can't wipe saved state.
  useEffect(() => {
    if (!user?.id || items.length === 0) return;
    const current = new Set(items.map(keyOf));
    try {
      localStorage.setItem(
        READ_STORAGE_PREFIX + user.id,
        JSON.stringify([...readKeys].filter(k => current.has(k))),
      );
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [readKeys, items, user?.id]);

  const unreadCount = useMemo(
    () => items.filter(n => !readKeys.has(keyOf(n))).length,
    [items, readKeys],
  );

  const markAllRead = useCallback(() => {
    setReadKeys(prev => new Set([...prev, ...items.map(keyOf)]));
  }, [items]);

  if (user?.role !== "dentist") return null;

  const goToSource = (n: NotificationItem) => {
    setReadKeys(prev => new Set(prev).add(keyOf(n)));
    setOpen(false);
    navigate(n.route, { state: { highlightId: n.id } });
  };

  return (
    <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (next) refresh(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}>
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px] leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[28rem] overflow-y-auto bg-popover">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={markAllRead}
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all as read
          </Button>
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
        ) : (
          items.map(n => {
            const unread = !readKeys.has(keyOf(n));
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => goToSource(n)}
                className={`w-full flex items-start gap-2 px-2 py-2 text-sm text-left rounded-sm hover:bg-accent ${unread ? "bg-primary/5" : ""}`}
              >
                <n.icon className={`w-4 h-4 mt-0.5 shrink-0 ${n.colorClass}`} />
                <div className="min-w-0 flex-1">
                  <p className={`leading-snug ${unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatManilaDateTime(n.time)}</p>
                </div>
                {unread && <span className="w-2 h-2 mt-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </button>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
