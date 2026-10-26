import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlarmClock, CalendarOff, CalendarPlus, CalendarCheck, CalendarClock, XCircle, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { getAppointments, isExpired, APPOINTMENTS_CHANGED, type Appointment } from "@/lib/api/appointments";
import { manilaNowMinutes, manilaTodayDateStr } from "@/lib/formatDate";
import { describeChange, getLeave, leaveHours, LEAVE_CHANGED, pendingChange, type LeaveRequest } from "@/lib/api/leave";
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

/** "Nov 3 – Nov 5" or "Nov 3". */
function leaveDays(l: LeaveRequest): string {
  const from = format(parseISO(l.startDate), "MMM d");
  const hours = leaveHours(l);
  if (hours) return `${from}, ${hours}`;
  return l.startDate === l.endDate ? from : `${from} – ${format(parseISO(l.endDate), "MMM d")}`;
}

/** Leave as each role needs to hear of it: a request to decide (superadmin), the decision
 * (the dentist), or who's away (the front desk). */
function leaveNotices(leave: LeaveRequest[], role: string, me: string): NotificationItem[] {
  const decided = (l: LeaveRequest, route: string): NotificationItem => ({
    // Timed by the decision, so a later change to the leave doesn't make it unread again.
    id: `leave-${l.id}`, time: l.decidedAt ?? l.updatedAt, route,
    title: l.status === "approved"
      ? `Your leave for ${leaveDays(l)} was approved`
      : `Your leave for ${leaveDays(l)} was rejected: ${l.decisionReason ?? ""}`,
    icon: CalendarOff, colorClass: l.status === "approved" ? "text-success" : "text-destructive",
  });
  const isDecided = (l: LeaveRequest) => l.status === "approved" || l.status === "rejected";
  const id = (l: LeaveRequest) => `leave-${l.id}`;
  const shortDays = (ds: string[]) => ds.map((d) => format(parseISO(d), "MMM d")).join(", ");
  // Approved leave the superadmin later cut short or called off: a fresh notice each time.
  const changed = (l: LeaveRequest, route: string): NotificationItem[] => (l.changedAt ? [{
    id: `leave-${l.id}-changed-${l.changedAt}`, time: l.changedAt, route,
    title: l.status === "cancelled"
      ? `Your leave for ${leaveDays(l)} was cancelled${l.changedBy ? ` by ${l.changedBy}` : ""}`
      : l.removedDates.length
        ? `Days removed from your leave for ${leaveDays(l)}: ${shortDays(l.removedDates)}. You work those days.`
        : `Your leave was changed${l.changedBy ? ` by ${l.changedBy}` : ""}: now ${leaveDays(l)}. You work the rest of that day.`,
    icon: CalendarOff, colorClass: "text-warning",
  }] : []);
  // The owner's ask to change approved leave, once the superadmin has decided it.
  const changeDecided = (l: LeaveRequest, route: string): NotificationItem[] => {
    const c = l.changeRequest;
    if (!c || c.status === "pending" || !c.decidedAt) return [];
    return [{
      id: `leave-${l.id}-change-${c.requestedAt}`, time: c.decidedAt, route,
      title: c.status === "approved"
        ? `Your change to leave ${leaveDays(l)} was approved: you ${describeChange(c).replace(/^leave only/, "are on leave only")}`
        : `Your change to leave ${leaveDays(l)} was rejected: ${c.decisionReason ?? ""}`,
      icon: CalendarOff, colorClass: c.status === "approved" ? "text-success" : "text-destructive",
    }];
  };
  const except = (l: LeaveRequest) => (l.removedDates.length ? `, except ${shortDays(l.removedDates)}` : "");
  switch (role) {
    case "superadmin":
      return [
        ...leave.filter((l) => l.status === "pending").map((l) => ({
          id: id(l), time: l.createdAt, route: "/superadmin/schedule",
          title: `${l.dentistName} requested leave: ${leaveDays(l)} (${l.reason})`,
          icon: CalendarOff, colorClass: "text-warning",
        })),
        ...leave.filter((l) => pendingChange(l)).map((l) => ({
          id: `leave-${l.id}-change-${l.changeRequest!.requestedAt}`, time: l.changeRequest!.requestedAt, route: "/superadmin/schedule",
          title: `${l.dentistName} asks to change leave ${leaveDays(l)}: ${describeChange(l.changeRequest!)}`,
          icon: CalendarOff, colorClass: "text-warning",
        })),
      ];
    case "dentist":
      return [
        ...leave.filter(isDecided).map((l) => decided(l, "/dentist/schedule")),
        ...leave.flatMap((l) => changed(l, "/dentist/schedule")),
        ...leave.flatMap((l) => changeDecided(l, "/dentist/schedule")),
      ];
    case "admin":
      // The server sends the front desk its own requests, and colleagues' approved leave
      // that hasn't ended yet.
      return [
        ...leave.filter((l) => l.dentistId === me && isDecided(l)).map((l) => decided(l, "/admin/schedule")),
        ...leave.filter((l) => l.dentistId === me).flatMap((l) => changed(l, "/admin/schedule")),
        ...leave.filter((l) => l.dentistId === me).flatMap((l) => changeDecided(l, "/admin/schedule")),
        ...leave.filter((l) => l.dentistId !== me).map((l) => ({
        id: id(l), time: l.updatedAt, route: "/admin",
        title: `${l.dentistName} is on leave ${leaveDays(l)}${except(l)} (${l.reason})`,
        icon: CalendarOff, colorClass: "text-muted-foreground",
      })),
      ];
    default:
      return [];
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
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!user) return;
    getAppointments().then(setAppointments).catch(() => {});
    // Leave matters to the superadmin (to decide), the dentist (the decision) and the front desk (who's away).
    if (user.role === "superadmin" || user.role === "dentist" || user.role === "admin") {
      getLeave().then((l) => setLeave(Array.isArray(l) ? l : [])).catch(() => {});
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load, then the same background polling the appointment pages use, so the
  // bell and sidebar counts move in step with the lists on screen.
  useEffect(() => refresh(), [refresh]);
  useAutoRefresh(refresh);

  // Changes made from this browser don't need to wait for the next poll.
  useEffect(() => {
    window.addEventListener(APPOINTMENTS_CHANGED, refresh);
    window.addEventListener(LEAVE_CHANGED, refresh);
    return () => {
      window.removeEventListener(APPOINTMENTS_CHANGED, refresh);
      window.removeEventListener(LEAVE_CHANGED, refresh);
    };
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

    const updates = relevant
      // A request the clock closed isn't news to act on; the reminder came before it.
      .filter(a => !isExpired(a))
      .map(a => ({ id: a.id, time: a.updatedAt, route: routeFor(a, user.role), ...describe(a, isPatient) }));

    // On the day, a request nobody has approved yet is called out again, while there's still
    // time: at its start time it's closed for good. Admins can approve it; the dentist sees
    // what's hanging on their day.
    const reminders: NotificationItem[] = [];
    if (user.role === "admin" || user.role === "dentist") {
      const today = manilaTodayDateStr();
      const now = manilaNowMinutes();
      // Dated the start of the clinic's day, so it sorts as today's news and is read once.
      const dayStart = new Date(`${today}T00:00:00+08:00`).toISOString();
      for (const a of relevant) {
        if (a.status !== "pending" || a.date !== today || toMinutes(a.time) <= now) continue;
        reminders.push({
          id: a.id,
          time: dayStart,
          route: routeFor(a, user.role),
          title: user.role === "admin"
            ? `Still pending: ${a.patientName}'s request for today at ${toLabel(toMinutes(a.time))} (${a.service}). Approve or reject it before then`
            : `Still awaiting approval: ${a.patientName}'s request for today at ${toLabel(toMinutes(a.time))} (${a.service})`,
          icon: AlarmClock,
          colorClass: "text-warning",
        });
      }
    }

    return [...updates, ...reminders, ...leaveNotices(leave, user.role, user.id)]
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 20);
  }, [appointments, leave, user]);

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
