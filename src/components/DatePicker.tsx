import { useState } from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { manilaTodayDateStr } from "@/lib/formatDate";

/**
 * The app's own date and month pickers, used by every date field in place of the
 * browser's: a button showing the date, opening a panel in the clinic's style that looks
 * the same in every browser. Values stay "yyyy-MM-dd" (or "yyyy-MM"), as the native
 * inputs gave, and `min`/`max` work as they did there.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`; // month 0-11
const toDate = (s: string) => parseISO(s.length === 7 ? `${s}-01` : s);

/** The trigger: looks like the app's inputs, calendar icon first. */
const TRIGGER = "flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm ring-offset-background hover:border-primary/50 data-[state=open]:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const NAV = cn(buttonVariants({ variant: "outline" }), "h-7 w-7 p-0 hover:bg-primary/10 hover:text-foreground");
const CELL = "rounded-md py-2 text-sm transition-colors hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-35";

interface FieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest allowed, in the value's own format. */
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** No Clear button: the field must keep a value. */
  required?: boolean;
  "aria-label"?: string;
}

/** ‹ label › across the top of every view. */
function Header({ label, onLabel, onPrev, onNext, prevLabel, nextLabel }: {
  label: string; onLabel?: () => void; onPrev: () => void; onNext: () => void; prevLabel: string; nextLabel: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <button type="button" className={NAV} onClick={onPrev} aria-label={prevLabel}><ChevronLeft className="h-4 w-4" /></button>
      {onLabel ? (
        <button type="button" onClick={onLabel} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold hover:bg-primary/10">
          {label} <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      ) : (
        <span className="text-sm font-semibold">{label}</span>
      )}
      <button type="button" className={NAV} onClick={onNext} aria-label={nextLabel}><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

/** Twelve years at a time; the one picked opens its months. */
function YearGrid({ year, selected, min, max, onPick }: { year: number; selected?: number; min?: string; max?: string; onPick: (y: number) => void }) {
  const [start, setStart] = useState(year - (year % 12));
  const current = Number(manilaTodayDateStr().slice(0, 4));
  const minYear = min ? Number(min.slice(0, 4)) : -Infinity;
  const maxYear = max ? Number(max.slice(0, 4)) : Infinity;
  return (
    <div>
      <Header label={`${start} – ${start + 11}`} onPrev={() => setStart(start - 12)} onNext={() => setStart(start + 12)}
        prevLabel="Earlier years" nextLabel="Later years" />
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 12 }, (_, i) => start + i).map((y) => (
          <button key={y} type="button" disabled={y < minYear || y > maxYear} onClick={() => onPick(y)}
            className={cn(CELL, y === selected ? "bg-primary font-semibold text-primary-foreground hover:bg-primary" : y === current && "border border-primary text-primary")}>
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One year's twelve months: the chosen one filled green, this month outlined. */
function MonthGrid({ year, setYear, selected, min, max, onPick, onYears }: {
  year: number; setYear: (y: number) => void; selected?: string; min?: string; max?: string;
  onPick: (key: string) => void; onYears: () => void;
}) {
  const thisMonth = manilaTodayDateStr().slice(0, 7);
  const lo = min?.slice(0, 7);
  const hi = max?.slice(0, 7);
  return (
    <div>
      <Header label={String(year)} onLabel={onYears} onPrev={() => setYear(year - 1)} onNext={() => setYear(year + 1)}
        prevLabel="Previous year" nextLabel="Next year" />
      <div className="grid grid-cols-3 gap-1">
        {MONTHS.map((m, i) => {
          const key = monthKey(year, i);
          return (
            <button key={m} type="button" disabled={(!!lo && key < lo) || (!!hi && key > hi)} onClick={() => onPick(key)}
              aria-label={format(toDate(key), "MMMM yyyy")} aria-pressed={key === selected}
              className={cn(CELL, key === selected ? "bg-primary font-semibold text-primary-foreground hover:bg-primary" : key === thisMonth && "border border-primary text-primary")}>
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Footer({ onToday, todayLabel, onClear }: { onToday?: () => void; todayLabel: string; onClear?: () => void }) {
  if (!onToday && !onClear) return null;
  return (
    <div className="mt-3 flex items-center justify-between border-t pt-2 text-sm">
      {onClear ? <button type="button" className="rounded px-2 py-1 text-muted-foreground hover:text-foreground" onClick={onClear}>Clear</button> : <span />}
      {onToday && <button type="button" className="rounded px-2 py-1 font-medium text-primary hover:bg-primary/10" onClick={onToday}>{todayLabel}</button>}
    </div>
  );
}

function Trigger({ id, disabled, label, placeholder, className, ariaLabel }: {
  id?: string; disabled?: boolean; label: string | null; placeholder: string; className?: string; ariaLabel?: string;
}) {
  return (
    <PopoverTrigger asChild>
      <button type="button" id={id} disabled={disabled} aria-label={ariaLabel} className={cn(TRIGGER, className)}>
        <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
        <span className={cn("flex-1 truncate", !label && "text-muted-foreground")}>{label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </PopoverTrigger>
  );
}

/** A month ("yyyy-MM"): a year at a time, click a month. */
export function MonthPicker({ id, value, onChange, min, max, placeholder = "Pick a month", className, disabled, required, "aria-label": ariaLabel }: FieldProps) {
  const [open, setOpen] = useState(false);
  const [years, setYears] = useState(false);
  const thisMonth = manilaTodayDateStr().slice(0, 7);
  const [year, setYear] = useState(() => Number((value || thisMonth).slice(0, 4)));
  const pick = (key: string) => { onChange(key); setOpen(false); };
  const inRange = (key: string) => (!min || key >= min.slice(0, 7)) && (!max || key <= max.slice(0, 7));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setYears(false); setYear(Number((value || thisMonth).slice(0, 4))); } }}>
      <Trigger id={id} disabled={disabled} label={value ? format(toDate(value), "MMMM yyyy") : null} placeholder={placeholder} className={className} ariaLabel={ariaLabel} />
      <PopoverContent align="start" className="w-64 p-3">
        {years ? (
          <YearGrid year={year} selected={year} min={min} max={max} onPick={(y) => { setYear(y); setYears(false); }} />
        ) : (
          <MonthGrid year={year} setYear={setYear} selected={value} min={min} max={max} onPick={pick} onYears={() => setYears(true)} />
        )}
        <Footer todayLabel="This month" onToday={inRange(thisMonth) ? () => pick(thisMonth) : undefined}
          onClear={!required && value ? () => pick("") : undefined} />
      </PopoverContent>
    </Popover>
  );
}

/** A day ("yyyy-MM-dd"): a month of days; the title opens months, then years, for jumping far. */
export function DatePicker({ id, value, onChange, min, max, placeholder = "Pick a date", className, disabled, required, "aria-label": ariaLabel }: FieldProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const today = manilaTodayDateStr();
  const [month, setMonth] = useState(() => toDate((value || today).slice(0, 7)));
  const pick = (v: string) => { onChange(v); setOpen(false); };
  const inRange = (d: string) => (!min || d >= min) && (!max || d <= max);
  const disabledDays: Matcher[] = [];
  if (min) disabledDays.push({ before: toDate(min) });
  if (max) disabledDays.push({ after: toDate(max) });
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setView("days"); setMonth(toDate((value || today).slice(0, 7))); } }}>
      <Trigger id={id} disabled={disabled} label={value ? format(toDate(value), "MMM d, yyyy") : null} placeholder={placeholder} className={className} ariaLabel={ariaLabel} />
      <PopoverContent align="start" className="w-auto p-3">
        <div className="w-[17.5rem]">
          {view === "years" ? (
            <YearGrid year={month.getFullYear()} selected={month.getFullYear()} min={min} max={max}
              onPick={(y) => { setMonth(new Date(y, month.getMonth(), 1)); setView("months"); }} />
          ) : view === "months" ? (
            <MonthGrid year={month.getFullYear()} setYear={(y) => setMonth(new Date(y, month.getMonth(), 1))}
              selected={value.slice(0, 7) || undefined} min={min} max={max}
              onPick={(key) => { setMonth(toDate(key)); setView("days"); }} onYears={() => setView("years")} />
          ) : (
            <>
              <Header label={format(month, "MMMM yyyy")} onLabel={() => setView("months")} onPrev={() => shift(-1)} onNext={() => shift(1)}
                prevLabel="Previous month" nextLabel="Next month" />
              <DayPicker
                mode="single"
                month={month}
                onMonthChange={setMonth}
                selected={value ? toDate(value) : undefined}
                onSelect={(d) => d && pick(format(d, "yyyy-MM-dd"))}
                disabled={disabledDays}
                today={toDate(today)}
                showOutsideDays
                classNames={{
                  caption: "hidden",
                  table: "w-full border-collapse",
                  head_row: "grid grid-cols-7",
                  head_cell: "text-center text-xs font-normal text-muted-foreground",
                  row: "mt-1 grid grid-cols-7",
                  cell: "p-0 text-center",
                  day: "mx-auto flex h-9 w-9 items-center justify-center rounded-md text-sm hover:bg-primary/10 disabled:pointer-events-none",
                  day_selected: "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  day_today: "border border-primary text-primary aria-selected:text-primary-foreground",
                  day_outside: "text-muted-foreground/50",
                  day_disabled: "opacity-35",
                }}
              />
            </>
          )}
          <Footer todayLabel="Today" onToday={view === "days" && inRange(today) ? () => pick(today) : undefined}
            onClear={view === "days" && !required && value ? () => pick("") : undefined} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
