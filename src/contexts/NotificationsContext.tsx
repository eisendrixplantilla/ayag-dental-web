import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarPlus, CalendarCheck, CalendarClock, XCircle, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getAppointments, APPOINTMENTS_CHANGED, type Appointment } from "@/lib/api/appointments";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";

const READ_STORAGE_PREFIX = "notifications:read:";

export interface NotificationItem {
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
export const keyOf = (n: NotificationItem) => `${n.id}:${n.time}`;

function loadReadKeys(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_PREFIX + userId);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

/** Each role jumps to the module it can actually act on the appointment in. */
function routeFor(apt: Appointment, role: string): string {
  switch (role) {
    case "dentist":
      // A finished consultation lives in Dental Records; anything else is still an appointment.
      return apt.status === "completed" ? "/dentist/records" : "/dentist/appointments";
    case "admin":
      return apt.type === "walk-in" ? "/admin/appointments" : "/admin/online-appointments";
    case "patient":
      return "/patient/appointments";
    default:
      // Superadmin has no per-appointment module — Reports is the closest thing.
      return "/superadmin/reports";
  }
}

function describe(apt: Appointment, isPatient: boolean): { title: string; icon: LucideIcon; colorClass: string } {
  const when = `${format(parseISO(apt.date), "MMM d, yyyy")} at ${toLabel(toMinutes(apt.time))}`;
  // Patients read about themselves, staff read about the patient.
  const subject = isPatient ? "Your" : `${apt.patientName}'s`;

  switch (apt.status) {
    case "pending":
      return {
        title: isPatient
          ? `Your booking request for ${apt.service} on ${when} is awaiting confirmation`
          : `New booking request from ${apt.patientName} — ${apt.service}, ${when}`,
        icon: CalendarPlus, colorClass: "text-warning",
      };
    case "confirmed":
      return {
        title: apt.type === "walk-in"
          ? (isPatient
            ? `A walk-in appointment was added for you — ${apt.service}, ${when}`
            : `Walk-in appointment added for ${apt.patientName} — ${apt.service}, ${when}`)
          : `${subject} appointment was confirmed — ${apt.service}, ${when}`,
        icon: CalendarCheck, colorClass: "text-success",
      };
    case "rescheduled":
      return { title: `${subject} appointment was rescheduled to ${when}`, icon: CalendarClock, colorClass: "text-warning" };
    case "cancelled":
      return {
        title: isPatient
          ? `Your appointment was cancelled (${apt.service})`
          : `${apt.patientName} cancelled their appointment (${apt.service})`,
        icon: XCircle, colorClass: "text-destructive",
      };
    case "rejected":
      return { title: `${subject} appointment request was rejected`, icon: XCircle, colorClass: "text-destructive" };
    case "completed":
      return {
        title: isPatient
          ? `Your consultation was completed — ${apt.service}`
          : `Consultation with ${apt.patientName} was completed`,
        icon: CheckCircle2, colorClass: "text-success",
      };
    default:
      return { title: `${subject} appointment was updated`, icon: CalendarClock, colorClass: "text-muted-foreground" };
  }
}

interface NotificationsValue {
  items: NotificationItem[];
  unreadCount: number;
  /** Unread count per sidebar route, so each module can show its own number. */
  unreadByRoute: Record<string, number>;
  isRead: (n: NotificationItem) => boolean;
  markRead: (n: NotificationItem) => void;
  markAllRead: () => void;
  refresh: () => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!user) return;
    getAppointments().then(setAppointments).catch(() => {});
  }, [user?.id]);

  // Initial load, then the same background polling the appointment pages use, so the
  // bell and sidebar counts move in step with the lists on screen.
  useEffect(() => refresh(), [refresh]);
  useAutoRefresh(refresh);

  // Changes made from this browser don't need to wait for the next poll.
  useEffect(() => {
    window.addEventListener(APPOINTMENTS_CHANGED, refresh);
    return () => window.removeEventListener(APPOINTMENTS_CHANGED, refresh);
  }, [refresh]);

  // Read state is per account, and the user isn't known on the very first render.
  useEffect(() => {
    if (user?.id) setReadKeys(loadReadKeys(user.id));
  }, [user?.id]);

  const items: NotificationItem[] = useMemo(() => {
    if (!user) return [];
    const isPatient = user.role === "patient";
    // Dentists only care about their own column of the schedule. Patients are already
    // scoped server-side to their own rows; admin and superadmin see everything.
    const relevant = user.role === "dentist"
      ? appointments.filter(a => a.dentistName === user.name)
      : appointments;

    return relevant
      .map(a => ({ id: a.id, time: a.updatedAt, route: routeFor(a, user.role), ...describe(a, isPatient) }))
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

  const value = useMemo<NotificationsValue>(() => {
    const unread = items.filter(n => !readKeys.has(keyOf(n)));
    const unreadByRoute: Record<string, number> = {};
    for (const n of unread) unreadByRoute[n.route] = (unreadByRoute[n.route] ?? 0) + 1;

    return {
      items,
      unreadCount: unread.length,
      unreadByRoute,
      isRead: (n) => readKeys.has(keyOf(n)),
      markRead: (n) => setReadKeys(prev => (prev.has(keyOf(n)) ? prev : new Set(prev).add(keyOf(n)))),
      markAllRead: () => setReadKeys(prev => new Set([...prev, ...items.map(keyOf)])),
      refresh,
    };
  }, [items, readKeys, refresh]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationsProvider");
  return ctx;
}
