import { toKey } from "@/lib/dentistSchedules";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { forServices, generateAvailableSlots, isDentistAvailableOn, type DentistScheduleData } from "@/lib/api/staff";
import type { DayBookings, ServiceLimit } from "@/lib/api/booking";

/** How a day reads on a booking calendar. */
export type DayState = "past" | "off" | "full" | "few" | "open";

export interface DayAvailability {
  state: DayState;
  /** How many more of this visit the day can take; 0 when full or not a working day. */
  left: number;
  /** The procedure whose daily limit makes the day full or nearly full, when it's that
   * rather than the dentist's free time. */
  limitedBy: string | null;
}

/** "Almost full" from this many left down. */
export const FEW_LEFT = 2;

/**
 * Whether a visit for `services` can go on `date`, and how many more like it the day can
 * take: the fewer of the dentist's free times the visit fits into, and what each of the
 * visit's procedures has left under the dentist's daily limit for it.
 */
export function dayAvailability(opts: {
  date: Date;
  schedule: DentistScheduleData | null;
  bookings: DayBookings | undefined;
  limits: ServiceLimit[];
  services: string[];
  visitMinutes?: number;
  /** How far ahead of now a time today has to be. */
  leadMinutes?: number;
}): DayAvailability {
  const { date } = opts;
  // Only the days and hours every one of the visit's services is done in.
  const schedule = opts.schedule && forServices(opts.schedule, opts.services);
  if (toKey(date) < manilaTodayDateStr()) return { state: "past", left: 0, limitedBy: null };
  if (!schedule || !isDentistAvailableOn(schedule, date)) return { state: "off", left: 0, limitedBy: null };

  let left = generateAvailableSlots(schedule, date, opts.bookings?.slots ?? [], opts.visitMinutes, opts.leadMinutes).length;
  let limitedBy: string | null = null;
  for (const service of opts.services) {
    // A number set for this day of the week wins over the dentist's every-day one.
    const limit = schedule.serviceHours?.find((h) => h.service === service)?.dayLimits?.[String(date.getDay())]
      ?? opts.limits.find((l) => l.service === service)?.dailyLimit;
    if (limit === undefined) continue;
    const room = Math.max(0, limit - (opts.bookings?.services[service] ?? 0));
    if (room <= left) {
      left = room;
      limitedBy = service;
    }
  }

  const state: DayState = left === 0 ? "full" : left <= FEW_LEFT ? "few" : "open";
  return { state, left, limitedBy };
}
