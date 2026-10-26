import { useCallback, useEffect, useMemo, useState } from "react";
import { DayPicker, type DayContentProps } from "react-day-picker";
import { ArrowRight, CalendarSearch, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toKey } from "@/lib/dentistSchedules";
import { manilaTodayAsLocalDate } from "@/lib/formatDate";
import type { DentistScheduleData } from "@/lib/api/staff";
import { getMonthAvailability, getServiceLimits, type DayBookings, type ServiceLimit } from "@/lib/api/booking";
import { dayAvailability, type DayAvailability } from "@/lib/dayAvailability";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface Props {
  schedule: DentistScheduleData | null;
  dentistId: string | null;
  dentistName?: string | null;
  /** The services the visit covers, whose daily limits apply. */
  services: string[];
  visitMinutes?: number;
  /** How far ahead of now a time today has to be, for patients booking themselves. */
  leadMinutes?: number;
  selected?: Date;
  onSelect: (date: Date | undefined) => void;
  /** A booking being moved, so it doesn't count against its own day. */
  excludeId?: string;
  /** The day ("YYYY-MM-DD") a patient's appointment is on now, when moving it: a move has
   * to be to another day, so it's marked and can't be picked. */
  currentDate?: string;
  /** Smaller cells, for a calendar inside a dialog. */
  compact?: boolean;
  className?: string;
}

const DOT: Record<DayAvailability["state"], string> = {
  open: "bg-success",
  few: "bg-warning",
  full: "bg-destructive",
  off: "bg-muted-foreground/40",
  past: "bg-transparent",
};

/**
 * The month a booking's date is picked from. Every day says how many more of this visit
 * it can take, from the dentist's free time and their daily limit for each procedure
 * (e.g. Veneers: 3 a day); full days and days off can't be picked.
 */
export default function BookingCalendar({
  schedule, dentistId, dentistName, services, visitMinutes, leadMinutes, selected, onSelect, excludeId, currentDate, compact, className,
}: Props) {
  const [month, setMonth] = useState<Date>(() => selected ?? manilaTodayAsLocalDate());
  const [limits, setLimits] = useState<ServiceLimit[]>([]);
  const [bookings, setBookings] = useState<Record<string, DayBookings>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!dentistId && !dentistName) { setLimits([]); return; }
    let live = true;
    getServiceLimits(dentistId, dentistName).then((l) => { if (live) setLimits(Array.isArray(l) ? l : []); }).catch(() => { if (live) setLimits([]); });
    return () => { live = false; };
  }, [dentistId, dentistName]);

  // The whole grid shown, including the days of the next and last months at its edges.
  const from = toKey(startOfWeek(startOfMonth(month)));
  const to = toKey(endOfWeek(endOfMonth(month)));
  const load = useCallback((silent = false) => {
    if (!dentistId && !dentistName) { setBookings({}); setLoaded(false); return; }
    if (!silent) setLoaded(false);
    getMonthAvailability({ dentistId, dentistName, from, to, excludeId })
      .then((days) => { setBookings(days && typeof days === "object" ? days : {}); setLoaded(true); })
      .catch(() => { if (!silent) { setBookings({}); setLoaded(true); } });
  }, [dentistId, dentistName, from, to, excludeId]);
  useEffect(() => { load(); }, [load]);
  // Others book while this is open: keep each day's count current.
  useAutoRefresh(() => load(true));

  const availabilityOf = useCallback((date: Date) => dayAvailability({
    date, schedule, bookings: bookings[toKey(date)], limits, services, visitMinutes, leadMinutes,
  }), [schedule, bookings, limits, services, visitMinutes, leadMinutes]);

  // Only leave for the whole day closes the day; leave for some hours just removes those times.

  const isCurrent = useCallback((date: Date) => !!currentDate && toKey(date) === currentDate, [currentDate]);

  const blocked = useCallback((date: Date) => {
    const a = availabilityOf(date);
    return isCurrent(date) || a.state === "past" || a.state === "off" || (loaded && a.state === "full");
  }, [availabilityOf, loaded, isCurrent]);

  // A day picked earlier can fill up — someone else books the last place, or another
  // service with its own limit is added to the visit — so let go of it rather than
  // keep offering times the server would refuse.
  useEffect(() => {
    if (selected && loaded && blocked(selected)) onSelect(undefined);
  }, [selected, loaded, blocked, onSelect]);

  // Which of the visit's procedures this dentist limits, to say so under the month.
  const applying = useMemo(() => limits.filter((l) => services.includes(l.service)), [limits, services]);

  const today = manilaTodayAsLocalDate();
  const gridStart = startOfWeek(startOfMonth(month));
  const gridEnd = endOfWeek(endOfMonth(month));

  // The first day from today, in the month on show, that still has room for this visit.
  const nextOpen = useMemo(() => {
    if (!loaded || !schedule) return null;
    for (let d = gridStart < today ? today : gridStart; d <= gridEnd; d = addDays(d, 1)) {
      const s = availabilityOf(d).state;
      if ((s === "open" || s === "few") && !isCurrent(d)) return d;
    }
    return null;
  }, [loaded, schedule, gridStart.getTime(), gridEnd.getTime(), today.getTime(), availabilityOf, isCurrent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each day takes a seventh of the width it's given, so the month always fits the screen
  // (a small phone included) and fills a tablet instead of sitting small in the middle.
  // The height steps up with the room, to keep the count readable.
  const height = compact ? "h-12 sm:h-14" : "h-12 min-[400px]:h-14 sm:h-16";

  const DayContent = ({ date, activeModifiers }: DayContentProps) => {
    const a = availabilityOf(date);
    // The appointment's own day, when moving it: says so in place of what's left.
    const current = isCurrent(date) && !activeModifiers.outside;
    const quiet = current || a.state === "past" || a.state === "off" || activeModifiers.outside;
    // Days off (a day they don't work, or a day of leave) and past days say nothing (the
    // legend covers them), so the days that can be booked stand out.
    const note = quiet ? "" : !loaded ? "…" : a.state === "full" ? "Full" : `${a.left} left`;
    return (
      <span className="flex flex-col items-center justify-center gap-0.5 leading-none max-w-full">
        {activeModifiers.today && (
          <span className={cn("text-[9px] font-semibold uppercase tracking-wide",
            activeModifiers.selected ? "text-primary-foreground" : "text-primary")}>Today</span>
        )}
        <span className={cn("font-semibold", compact ? "text-sm" : "text-sm sm:text-base")}>{date.getDate()}</span>
        {note && (
          <span className={cn(
            "flex items-center gap-1 text-[9px] min-[400px]:text-[10px] sm:text-[11px] font-medium whitespace-nowrap",
            !activeModifiers.selected && (a.state === "full" ? "text-destructive" : a.state === "few" ? "text-warning" : "text-success"),
          )}>
            {loaded && (a.state === "open" || a.state === "few") && (
              <span className={cn("hidden min-[360px]:inline-block w-1.5 h-1.5 rounded-full shrink-0", activeModifiers.selected ? "bg-primary-foreground" : DOT[a.state])} aria-hidden />
            )}
            {note}
          </span>
        )}
        {current && (
          <span className="text-[9px] min-[400px]:text-[10px] font-medium text-primary whitespace-nowrap">Current</span>
        )}
      </span>
    );
  };

  const picked = selected && loaded ? availabilityOf(selected) : null;
  const inMonth = (d: Date) => d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
  const visits = (n: number) => `${n} more visit${n === 1 ? "" : "s"}`;

  return (
    <div className={cn("space-y-2.5 pb-3 sm:pb-4", className)}>
      {/* Until a day is picked: once one is, the summary below takes over. */}
      {schedule && loaded && !selected && (
        <div className="px-2 sm:px-3 pt-2 sm:pt-3">
          {nextOpen ? (
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-success/40 bg-success/5 hover:bg-success/15"
              onClick={() => onSelect(nextOpen)}>
              <CalendarSearch className="w-3.5 h-3.5 text-success" aria-hidden />
              Next available: <span className="font-semibold">{format(nextOpen, "EEE, MMM d")}</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" className="h-auto min-h-8 py-1.5 gap-1.5 text-xs whitespace-normal text-left" onClick={() => setMonth(addMonths(month, 1))}>
              No openings left in {format(month, "MMMM")} — see {format(addMonths(month, 1), "MMMM")}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Button>
          )}
        </div>
      )}
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={onSelect}
        month={month}
        onMonthChange={setMonth}
        fromMonth={startOfMonth(today)}
        disabled={blocked}
        showOutsideDays
        className="p-2 sm:p-3 pointer-events-auto"
        modifiers={{
          // Colour only this month's days; the neighbouring months' days at the edges stay plain.
          open: (d) => loaded && inMonth(d) && availabilityOf(d).state === "open",
          few: (d) => loaded && inMonth(d) && availabilityOf(d).state === "few",
          full: (d) => loaded && inMonth(d) && availabilityOf(d).state === "full",
          off: (d) => availabilityOf(d).state === "off",
          past: (d) => availabilityOf(d).state === "past",
          current: (d) => inMonth(d) && isCurrent(d),
        }}
        modifiersClassNames={{
          open: "bg-success/10 border-success/30 hover:bg-success/20",
          few: "bg-warning/15 border-warning/50 hover:bg-warning/25",
          full: "bg-destructive/10 border-destructive/25 text-destructive/80",
          off: "text-muted-foreground/50",
          past: "text-muted-foreground/35",
          current: "!bg-primary/5 !border-dashed !border-primary/50",
        }}
        classNames={{
          months: "flex flex-col w-full",
          month: "space-y-3 w-full",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-base font-semibold font-heading",
          nav: "space-x-1 flex items-center",
          nav_button: cn(buttonVariants({ variant: "outline" }), "h-8 w-8 bg-transparent p-0 disabled:opacity-30"),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse",
          head_row: "flex w-full",
          head_cell: "flex-1 min-w-0 text-muted-foreground font-medium text-xs",
          row: "flex w-full mt-1",
          cell: cn("flex-1 min-w-0 p-0.5 text-center relative focus-within:z-20", height),
          day: cn(
            "h-full w-full rounded-lg border border-transparent p-0 font-normal transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "aria-selected:opacity-100",
          ),
          day_selected: "!bg-primary !text-primary-foreground !border-primary hover:!bg-primary shadow-md ring-2 ring-primary/25",
          day_outside: "opacity-40",
          day_disabled: "hover:bg-transparent cursor-not-allowed",
          day_hidden: "invisible",
        }}
        components={{
          IconLeft: () => <ChevronLeft className="h-4 w-4" />,
          IconRight: () => <ChevronRight className="h-4 w-4" />,
          DayContent,
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 sm:px-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" aria-hidden />Available</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" aria-hidden />Almost full</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" aria-hidden />Full</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/40" aria-hidden />Day off</span>
        {currentDate && (
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm border border-dashed border-primary/60 bg-primary/5" aria-hidden />Current day</span>
        )}
      </div>
      {applying.length > 0 && (
        <p className="px-2 sm:px-3 text-xs text-foreground">
          <span className="font-semibold">Daily limit{applying.length > 1 ? "s" : ""}:</span>{" "}
          {applying.map((l) => `${l.service} ${l.dailyLimit}/day`).join(" · ")}
        </p>
      )}
      {/* What the picked day has left, in the same terms as the cell, so a "1 left" day
          beside a long list of open times doesn't read as a contradiction. */}
      {selected && picked && picked.left > 0 && (
        <p className="mx-2 sm:mx-3 flex items-start gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs leading-relaxed text-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-semibold">{format(selected, "EEE, MMM d")}:</span>{" "}
            {picked.limitedBy
              ? <>{picked.left} {picked.limitedBy} place{picked.left === 1 ? "" : "s"} left — any of the open times can take {picked.left === 1 ? "it" : "them"}.</>
              : <>room for {visits(picked.left)} like this one.</>}
          </span>
        </p>
      )}
    </div>
  );
}
