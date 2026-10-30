import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays, format, parseISO, startOfMonth, startOfWeek, startOfYear, subMonths } from "date-fns";
import { byNewestBooked, type Appointment } from "@/lib/api/appointments";
import { formatTimeRange, toMinutes } from "@/lib/dentistSchedules";
import { manilaTodayDateStr } from "@/lib/formatDate";
import type { ReportTable } from "@/lib/printReport";
import { STATUSES, STATUS_LABEL, byService, countByStatus, inPeriod, periodBounds, type Period } from "@/lib/reportPeriod";

/** The period of the same kind just before this one (the month before, or as many days
 * before a range); none before all time. */
export function previousPeriod(p: Period): Period | null {
  if (p.kind === "all") return null;
  if (p.kind === "month") return { kind: "month", month: format(subMonths(parseISO(`${p.month}-01`), 1), "yyyy-MM") };
  const b = periodBounds(p)!;
  const days = differenceInCalendarDays(parseISO(b.to), parseISO(b.from)) + 1;
  return {
    kind: "range",
    from: format(addDays(parseISO(b.from), -days), "yyyy-MM-dd"),
    to: format(addDays(parseISO(b.from), -1), "yyyy-MM-dd"),
  };
}

/** Whole-percent change from `before` to `now`; null when there's nothing to compare to. */
export function percentChange(now: number, before: number | null): number | null {
  if (before === null || before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Who an appointment is for: the account, or a guest's name and number. */
const patientKey = (a: Appointment) => a.patientId ?? `${a.patientName.trim().toLowerCase()}|${(a.contact ?? "").replace(/\D/g, "")}`;

/** How many different patients the appointments are for. */
export function distinctPatients(appointments: Appointment[]): number {
  return new Set(appointments.map(patientKey)).size;
}

/**
 * The share of appointments that came due (dated up to today) and were completed, as a
 * whole percent; null when none came due. Pending requests still ahead don't count.
 */
export function successRate(appointments: Appointment[], today: string): number | null {
  const due = appointments.filter((a) => a.date <= today);
  if (due.length === 0) return null;
  return Math.round((due.filter((a) => a.status === "completed").length / due.length) * 100);
}

/** The success rate for each of the last `months` months, oldest first. */
export function monthlySuccess(appointments: Appointment[], today: string, months = 7): { label: string; rate: number | null }[] {
  const first = startOfMonth(subMonths(parseISO(today), months - 1));
  return Array.from({ length: months }, (_, i) => {
    const m = format(addMonths(first, i), "yyyy-MM");
    return {
      label: format(addMonths(first, i), "MMM"),
      rate: successRate(appointments.filter((a) => a.date.startsWith(m)), today),
    };
  });
}

export type Span = "weekly" | "monthly" | "yearly";

/**
 * The Appointment chart's bars, ending with the current week, month or year: the last 8
 * weeks (from Monday), 9 months, or 5 years, each with its appointments and how many
 * of them were completed.
 */
export function appointmentBars(appointments: Appointment[], span: Span, today: string): { label: string; appointments: number; completed: number }[] {
  const now = parseISO(today);
  const slots: { from: string; to: string; label: string }[] = [];
  if (span === "weekly") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    for (let i = 7; i >= 0; i--) {
      const from = addWeeks(start, -i);
      slots.push({ from: format(from, "yyyy-MM-dd"), to: format(addDays(from, 6), "yyyy-MM-dd"), label: format(from, "MMM d") });
    }
  } else if (span === "monthly") {
    const start = startOfMonth(now);
    for (let i = 8; i >= 0; i--) {
      const from = addMonths(start, -i);
      slots.push({ from: format(from, "yyyy-MM-dd"), to: format(addDays(addMonths(from, 1), -1), "yyyy-MM-dd"), label: format(from, "MMM") });
    }
  } else {
    const start = startOfYear(now);
    for (let i = 4; i >= 0; i--) {
      const from = addYears(start, -i);
      slots.push({ from: format(from, "yyyy-MM-dd"), to: format(addDays(addYears(from, 1), -1), "yyyy-MM-dd"), label: format(from, "yyyy") });
    }
  }
  return slots.map((s) => {
    const inSlot = appointments.filter((a) => a.date >= s.from && a.date <= s.to);
    return { label: s.label, appointments: inSlot.length, completed: inSlot.filter((a) => a.status === "completed").length };
  });
}

/** The most-booked services with everything past the first `top` folded into "Others". */
export function topTreatments(counts: { name: string; count: number }[], top = 3): { name: string; count: number }[] {
  const head = counts.slice(0, top);
  const rest = counts.slice(top).reduce((n, c) => n + c.count, 0);
  return rest > 0 ? [...head, { name: "Others", count: rest }] : head;
}

/** The dashboard on paper, for the period on show: its numbers, the appointments by
 * status and treatment, the requests waiting, and today's appointments. */
export function dashboardPrintTables(appointments: Appointment[], period: Period): ReportTable[] {
  const today = manilaTodayDateStr();
  const shown = inPeriod(appointments, period);
  const prev = previousPeriod(period);
  const before = prev ? inPeriod(appointments, prev) : null;
  const change = (now: number, was: number | null) => {
    const c = percentChange(now, was);
    return c === null ? "—" : `${c >= 0 ? "+" : ""}${c}%`;
  };
  const n = (list: Appointment[] | null, status?: string) => (list ? list.filter((a) => !status || a.status === status).length : null);
  const counts = countByStatus(shown);
  const rate = successRate(shown, today);
  return [
    {
      heading: "Summary",
      showCount: false,
      columns: ["Statistic", "Count", "Change"],
      rows: [
        ["Total Patients", String(distinctPatients(shown)), change(distinctPatients(shown), before ? distinctPatients(before) : null)],
        ["Consultations", String(n(shown, "completed")), change(n(shown, "completed")!, n(before, "completed"))],
        ["Appointments", String(shown.length), change(shown.length, n(before))],
        ["Pending Requests", String(n(shown, "pending")), change(n(shown, "pending")!, n(before, "pending"))],
        ["Success Rate", rate === null ? "—" : `${rate}%`, "—"],
      ],
    },
    {
      heading: "Appointments by Status",
      showCount: false,
      columns: ["Status", "Appointments"],
      rows: STATUSES.map((s) => [STATUS_LABEL[s], String(counts[s])]),
    },
    {
      heading: "Top Treatments",
      columns: ["Service", "Count"],
      rows: topTreatments(byService(shown, Infinity)).map((s) => [s.name, String(s.count)]),
      emptyText: "No treatments in this period.",
    },
    {
      heading: "Approval Requests",
      columns: ["Patient", "Service", "Date", "Time"],
      rows: appointments.filter((a) => a.status === "pending" && a.date >= today).sort(byNewestBooked)
        .map((a) => [a.patientName, a.service, format(parseISO(a.date), "MMM d, yyyy"), formatTimeRange(a.time, a.endTime)]),
      emptyText: "No requests waiting for approval.",
    },
    {
      heading: "Today's Appointments",
      columns: ["Time", "Patient", "Service", "Status"],
      rows: appointments.filter((a) => a.date === today && a.status !== "cancelled" && a.status !== "rejected")
        .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
        .map((a) => [formatTimeRange(a.time, a.endTime), a.patientName, a.service, STATUS_LABEL[a.status]]),
      emptyText: "No appointments today.",
    },
  ];
}

/** When a patient joined, and whether they have an account (or are a walk-in guest). */
export interface Joined { date: string; account: boolean }

/** Each patient once, joined on their first appointment's date: everyone a dentist has seen,
 * or (with `guestsOnly`) the walk-in guests who never made an account. */
export function firstVisits(appointments: Appointment[], guestsOnly = false): Joined[] {
  const first = new Map<string, Joined>();
  for (const a of appointments) {
    if (guestsOnly && a.patientId) continue;
    const key = patientKey(a);
    const seen = first.get(key);
    if (!seen || a.date < seen.date) first.set(key, { date: a.date, account: !!a.patientId });
  }
  return [...first.values()];
}

/** The patient totals card's figures: joined this month and last, all time split into
 * accounts and guests, and how many joined in each of the last `months` months. */
export function joinedSummary(joined: Joined[], today: string, months = 6) {
  const thisMonth = today.slice(0, 7);
  const lastMonth = format(subMonths(parseISO(today), 1), "yyyy-MM");
  const first = startOfMonth(subMonths(parseISO(today), months - 1));
  return {
    month: joined.filter((j) => j.date.startsWith(thisMonth)).length,
    previous: joined.filter((j) => j.date.startsWith(lastMonth)).length,
    previousLabel: format(parseISO(`${lastMonth}-01`), "MMM"),
    all: joined.length,
    accounts: joined.filter((j) => j.account).length,
    guests: joined.filter((j) => !j.account).length,
    trend: Array.from({ length: months }, (_, i) => {
      const m = addMonths(first, i);
      const key = format(m, "yyyy-MM");
      return { label: format(m, "MMM"), count: joined.filter((j) => j.date.startsWith(key)).length };
    }),
  };
}
