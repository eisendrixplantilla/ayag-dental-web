import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarCheck, Check, Clock3, History, Loader2, Stethoscope } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Hint from "@/components/Hint";
import { cn } from "@/lib/utils";
import { toKey } from "@/lib/dentistSchedules";
import { manilaTodayAsLocalDate } from "@/lib/formatDate";
import { getDentistSchedule } from "@/lib/api/staff";
import { getAppointments, recentDentist } from "@/lib/api/appointments";
import { getDentistProfiles, getMonthAvailability, offersAll, type DentistProfile } from "@/lib/api/booking";
import { dayAvailability } from "@/lib/dayAvailability";
import { describeWorkingDays } from "@/lib/workingDays";
import DentistAvatar from "@/components/DentistAvatar";

/** How far ahead "Next available" looks. */
const LOOK_AHEAD_DAYS = 30;

/** The first day in the next month or so with room for this visit with this dentist. */
async function nextAvailable(d: DentistProfile, services: string[], visitMinutes?: number, leadMinutes?: number): Promise<Date | null> {
  const today = manilaTodayAsLocalDate();
  const last = addDays(today, LOOK_AHEAD_DAYS);
  const [schedule, bookings] = await Promise.all([
    getDentistSchedule(d.id),
    getMonthAvailability({ dentistId: d.id, dentistName: d.name, from: toKey(today), to: toKey(last) }),
  ]);
  for (let day = today; day <= last; day = addDays(day, 1)) {
    const a = dayAvailability({ date: day, schedule, bookings: bookings[toKey(day)], limits: d.limits, services, visitMinutes, leadMinutes });
    if (a.state === "open" || a.state === "few") return day;
  }
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The services being booked: dentists who offer them all come first. */
  services: string[];
  visitMinutes?: number;
  selectedId?: string;
  onChoose: (dentistId: string) => void;
  /** Whose latest dentist to mark as Recent: a patient's id, or "self" for the signed-in patient. */
  recentFor?: string;
  /** How far ahead of now a time today has to be, for patients booking themselves. */
  leadMinutes?: number;
}

/**
 * Every dentist side by side, so a patient (or the front desk) can choose one: what each
 * offers, when they work, their daily limits, and the first day they have room for this
 * visit. Dentists who don't offer one of the chosen services are shown last, and can't be
 * chosen for it.
 */
export default function DentistCards({ open, onOpenChange, services, visitMinutes, selectedId, onChoose, recentFor, leadMinutes }: Props) {
  const [dentists, setDentists] = useState<DentistProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [next, setNext] = useState<Record<string, Date | null | "loading">>({});
  const [recent, setRecent] = useState<{ id: string | null; name: string | null } | null>(null);

  // The dentist this patient saw (or booked) last, so they're easy to find again.
  useEffect(() => {
    if (!open || !recentFor) { setRecent(null); return; }
    let live = true;
    getAppointments(recentFor === "self" ? {} : { patientId: recentFor })
      .then((list) => { if (live) setRecent(recentDentist(Array.isArray(list) ? list : [])); })
      .catch(() => { if (live) setRecent(null); });
    return () => { live = false; };
  }, [open, recentFor]);
  const isRecent = (d: DentistProfile) =>
    !!recent && (recent.id ? recent.id === d.id : !!recent.name && recent.name === d.name);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    getDentistProfiles()
      .then((list) => { if (live) setDentists(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [open]);

  // Each dentist's next free day for this visit, worked out once the list is in.
  const servicesKey = services.join("|");
  useEffect(() => {
    if (!open || !dentists || services.length === 0) { setNext({}); return; }
    let live = true;
    const able = dentists.filter((d) => offersAll(d, services));
    setNext(Object.fromEntries(able.map((d) => [d.id, "loading" as const])));
    for (const d of able) {
      nextAvailable(d, services, visitMinutes, leadMinutes)
        .then((day) => { if (live) setNext((n) => ({ ...n, [d.id]: day })); })
        .catch(() => { if (live) setNext((n) => ({ ...n, [d.id]: null })); });
    }
    return () => { live = false; };
  }, [open, dentists, servicesKey, visitMinutes, leadMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = dentists
    ? [...dentists].sort((a, b) =>
        Number(offersAll(b, services)) - Number(offersAll(a, services)) || Number(isRecent(b)) - Number(isRecent(a)))
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Nothing is focused on opening, so no tooltip pops up before anyone points at it. */}
      <DialogContent className="w-full max-w-[min(94vw,52rem)] max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" /> Our Dentists
          </DialogTitle>
          <DialogDescription>
            {services.length
              ? <>Who offers <span className="font-medium text-foreground">{services.join(", ")}</span>, when they work, and their next free day.</>
              : "What each dentist offers, on which days, and how many of each they take a day."}
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p className="text-sm text-destructive py-6 text-center">Couldn't load the dentists. Please try again.</p>
        ) : !dentists ? (
          <p className="text-sm text-muted-foreground py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading dentists…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No dentists are available for booking right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sorted.map((d) => {
              const able = offersAll(d, services);
              const missing = d.services ? services.filter((s) => !d.services!.includes(s)) : [];
              const chosen = d.id === selectedId;
              const last = isRecent(d);
              const n = next[d.id];
              const workDays = [...new Set(d.days.map((x) => x.dayOfWeek))].sort((a, b) => a - b);
              return (
                <div key={d.id} className={cn(
                  "rounded-lg border p-4 flex flex-col gap-3",
                  chosen ? "border-primary bg-primary/5" : able ? "bg-card" : "bg-muted/40 opacity-75",
                  last && !chosen && "border-primary/50 ring-1 ring-primary/30",
                )} data-recent={last || undefined}>
                  <div className="flex items-center gap-3">
                    <DentistAvatar d={d} className="w-11 h-11 text-sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground">Dentist</p>
                    </div>
                    <div className="ml-auto flex flex-wrap justify-end gap-1 shrink-0">
                      {last && (
                        <Hint label="Dentist of the latest booking">
                          {/* Badge takes no ref, which the tooltip needs to point at it. */}
                          <span className="inline-flex">
                            <Badge variant="outline" className="gap-1 border-primary/40 bg-primary/10 text-primary">
                              <History className="w-3 h-3" />Recent
                            </Badge>
                          </span>
                        </Hint>
                      )}
                      {chosen && <Badge className="gap-1"><Check className="w-3 h-3" />Chosen</Badge>}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs text-foreground">
                    {d.days.length ? describeWorkingDays(d.days).map((line) => (
                      <p key={line} className="flex items-start gap-1.5"><Clock3 className="w-3.5 h-3.5 mt-px shrink-0 text-primary" />{line}</p>
                    )) : <p className="text-muted-foreground">No working schedule set yet.</p>}
                  </div>

                  {d.services && workDays.length > 0 ? (
                    <ServiceDays d={d} days={workDays} highlight={services} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {d.services ? d.services.join(", ") : "All services"}, any working day.
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                    {!able ? (
                      <p className="text-xs font-medium text-destructive">Doesn't offer {missing.join(", ")}</p>
                    ) : services.length === 0 ? <span /> : n === "loading" || n === undefined ? (
                      <p className="text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin inline mr-1" />Checking dates…</p>
                    ) : n ? (
                      <p className="text-xs font-medium text-success flex items-center gap-1">
                        <CalendarCheck className="w-3.5 h-3.5" />Next available: {format(n, "EEE, MMM d")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No openings in the next {LOOK_AHEAD_DAYS} days</p>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant={chosen ? "secondary" : "default"}
                      className={cn(!chosen && able && "gradient-primary text-primary-foreground")}
                      disabled={!able || d.days.length === 0}
                      onClick={() => { onChoose(d.id); onOpenChange(false); }}
                    >
                      {chosen ? "Chosen" : "Choose this dentist"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A dentist's services against their working days: how many of each they take that day,
 * or — when they don't do it then. The services being booked are highlighted. */
function ServiceDays({ d, days, highlight }: { d: DentistProfile; days: number[]; highlight: string[] }) {
  const cell = (service: string, day: number): string => {
    const rule = (d.hours ?? []).find((h) => h.service === service);
    if (rule?.days.length && !rule.days.includes(day)) return "—";
    const n = rule?.dayLimits?.[String(day)] ?? d.limits.find((l) => l.service === service)?.dailyLimit;
    return n === undefined ? "✓" : String(n);
  };
  return (
    <div className="space-y-1">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th scope="col" className="px-2 py-1.5 text-left font-medium">Service</th>
              {days.map((day) => (
                <th key={day} scope="col" className="w-9 px-1 py-1.5 text-center font-medium">{SHORT_DAYS[day]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.services!.map((service) => {
              const on = highlight.includes(service);
              return (
                <tr key={service} className={cn("border-b last:border-0", on && "bg-primary/10 font-medium text-primary")}>
                  <th scope="row" className="px-2 py-1.5 text-left font-normal">{service}</th>
                  {days.map((day) => {
                    const v = cell(service, day);
                    return (
                      <td key={day} className={cn("px-1 py-1.5 text-center tabular-nums", v === "—" && "text-muted-foreground/60")}>{v}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Each number is how many patients this dentist can take for that service on that day. A dash (—) means they
        don't do that service that day.
      </p>
    </div>
  );
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
