import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReadableId } from "@/hooks/useReadableId";
import { ArrowLeft, Clock, Loader2, Save, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, CODE_COL, NUM_COL } from "@/lib/tableClass";
import {
  getStaff, getStaffMember, getDentistSchedule, saveDentistScheduleDays, removeDentistUnavailable,
  generateAvailableSlots, DAY_NAMES, type ScheduleDay, type ServiceHours, type StaffMember, type UnavailableDate,
} from "@/lib/api/staff";
import { getDentistProfiles, getServiceLimits, saveDentistServices, saveServiceHours, saveServiceLimits } from "@/lib/api/booking";
import Hint from "@/components/Hint";
import { StaffLeave } from "@/components/LeaveRequests";
import { LEAVE_CHANGED } from "@/lib/api/leave";
import { cn } from "@/lib/utils";
import { getServices } from "@/lib/api/dentalRecords";
import DentistAvatar from "@/components/DentistAvatar";

interface DayConfig {
  enabled: boolean;
  start: string;
  end: string;
  lunchStart: string;
  lunchEnd: string;
  duration: number;
  maxPatients: number;
}

const emptyDayConfig = (): DayConfig => ({
  enabled: false, start: "09:00", end: "17:00", lunchStart: "12:00", lunchEnd: "13:00", duration: 30, maxPatients: 20,
});

/**
 * Superadmin › Staff › a dentist › Schedule. Everything that decides when and for what a
 * dentist can be booked, on a page of its own: working days and hours, the services they
 * offer and how many of each a day, and the days they're away.
 */
/** The link carries the person's Employee ID (DT-261001); the page works from the account's id. */
export default function SuperAdminDentistSchedule() {
  const navigate = useNavigate();
  const { id, missing } = useReadableId(async (code) => (await getStaff()).find((s) => s.employeeId === code)?.id);
  if (missing) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <p>No staff account has that ID.</p>
        <Button variant="link" onClick={() => navigate("/superadmin/staff")}>Back to Staff</Button>
      </div>
    );
  }
  if (!id) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  return <StaffSchedule id={id} />;
}

function StaffSchedule({ id }: { id: string }) {
  const navigate = useNavigate();
  const [dentist, setDentist] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDays, setSavingDays] = useState(false);
  const [savingServices, setSavingServices] = useState(false);
  // Each section as last saved, to tell whether it has changes still to save.
  const [savedDays, setSavedDays] = useState("");
  const [savedServices, setSavedServices] = useState("");

  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(Array.from({ length: 7 }, emptyDayConfig));
  // How many of each offered procedure this dentist takes on each working day, as typed:
  // service → day number → count. Required; 0 = they don't do it that day.
  const [limitDrafts, setLimitDrafts] = useState<Record<string, Record<string, string>>>({});
  const [serviceNames, setServiceNames] = useState<string[]>([]);
  // The services this dentist offers; none ticked means every service.
  const [offered, setOffered] = useState<Set<string>>(new Set());
  const [unavailableList, setUnavailableList] = useState<UnavailableDate[]>([]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    // The schedule itself has to load; the services, limits and what the dentist offers are
    // extras, so one of those failing leaves its section empty rather than the whole page.
    const orEmpty = <T,>(p: Promise<T[]>) => p.then((v) => (Array.isArray(v) ? v : [])).catch(() => [] as T[]);
    Promise.all([
      getStaffMember(id), getDentistSchedule(id),
      orEmpty(getServices()), orEmpty(getServiceLimits(id)), orEmpty(getDentistProfiles()),
    ])
      .then(([member, schedule, services, limits, profiles]) => {
        if (!live) return;
        setDentist(member);
        const configs = Array.from({ length: 7 }, emptyDayConfig);
        for (const d of schedule.days) {
          configs[d.dayOfWeek] = {
            enabled: true, start: d.start, end: d.end,
            lunchStart: d.lunchStart ?? "", lunchEnd: d.lunchEnd ?? "",
            duration: d.duration, maxPatients: d.maxPatients,
          };
        }
        setDayConfigs(configs);
        setSavedDays(daysKey(configs));
        setUnavailableList(schedule.unavailable);
        const names = services.map((sv) => sv.name);
        const offers = profiles.find((p) => p.id === id)?.services ?? [];
        // Each working day's number for a service, from how it was saved: a day it isn't done
        // on is 0, a day with a number keeps it, and one without (no limit, the old way) is
        // left empty to be filled in. A limit set the old way, the same every day, fills those.
        const working = configs.flatMap((c, i) => (c.enabled ? [i] : []));
        const drafts: Record<string, Record<string, string>> = {};
        for (const h of schedule.serviceHours ?? []) {
          drafts[h.service] = Object.fromEntries(working.map((d) => [String(d),
            h.days.length && !h.days.includes(d) ? "0" : String(h.dayLimits?.[String(d)] ?? "")]));
        }
        for (const l of limits) {
          drafts[l.service] = Object.fromEntries(working.map((d) => {
            const had = drafts[l.service]?.[String(d)] ?? "";
            return [String(d), had === "" ? String(l.dailyLimit) : had];
          }));
        }
        // A limit or service kept for one since taken off the list still shows, so it can be cleared.
        for (const n of [...limits.map((l) => l.service), ...offers]) if (!names.includes(n)) names.push(n);
        setServiceNames(names);
        setLimitDrafts(drafts);
        setOffered(new Set(offers));
        setSavedServices(servicesKey(new Set(offers), drafts, working));
      })
      .catch(() => { if (live) toast.error("Failed to load this dentist's schedule"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  const updateDay = (i: number, patch: Partial<DayConfig>) => {
    setDayConfigs((cfgs) => cfgs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };

  const previewDay = useMemo(() => dayConfigs.findIndex((c) => c.enabled), [dayConfigs]);
  const previewSlots = useMemo(() => {
    if (previewDay === -1) return [];
    const cfg = dayConfigs[previewDay];
    const days: ScheduleDay[] = [{
      dayOfWeek: previewDay, start: cfg.start, end: cfg.end,
      lunchStart: cfg.lunchStart || null, lunchEnd: cfg.lunchEnd || null,
      duration: cfg.duration, maxPatients: cfg.maxPatients,
    }];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (d.getDay() === previewDay) return generateAvailableSlots({ days, unavailable: [] }, d, []);
    }
    return [];
  }, [dayConfigs, previewDay]);

  const daysDirty = !loading && daysKey(dayConfigs) !== savedDays;
  const workingDays = dayConfigs.flatMap((c, i) => (c.enabled ? [i] : []));
  const servicesDirty = !loading && servicesKey(offered, limitDrafts, workingDays) !== savedServices;

  // The table shows the whole week; only the working days take a number.
  const tableDays = [0, 1, 2, 3, 4, 5, 6];
  const countOf = (service: string, day: number) => limitDrafts[service]?.[String(day)] ?? "";

  /** Working Days & Hours: just the week. */
  const saveDays = async () => {
    const enabledDays = dayConfigs.map((c, i) => ({ c, i })).filter(({ c }) => c.enabled);
    if (enabledDays.length === 0) return toast.error("Select at least one working day");
    for (const { c } of enabledDays) {
      if (c.duration < 10) return toast.error("Appointment duration must be at least 10 minutes");
      if (c.maxPatients < 1) return toast.error("Maximum patients per day must be at least 1");
    }
    const days: ScheduleDay[] = enabledDays.map(({ c, i }) => ({
      dayOfWeek: i, start: c.start, end: c.end,
      lunchStart: c.lunchStart || null, lunchEnd: c.lunchEnd || null,
      duration: c.duration, maxPatients: c.maxPatients,
    }));
    setSavingDays(true);
    try {
      await saveDentistScheduleDays(id, days);
      setSavedDays(daysKey(dayConfigs));
      toast.success("Working days saved — appointment slots regenerated system-wide");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save working days");
    } finally {
      setSavingDays(false);
    }
  };

  /** Services & Daily Limits: what the dentist offers, on which days, and how many each day. */
  const saveServices = async () => {
    // Every offered service needs a number for every working day: how many they take that
    // day, or 0 when they don't do it then.
    for (const service of offered) {
      const missing = workingDays.find((d) => countOf(service, d) === "");
      if (missing !== undefined) return toast.error(`Enter how many ${service} on ${DAY_NAMES[missing]} (0 if they don't do it that day)`);
      if (workingDays.every((d) => Number(countOf(service, d)) === 0)) {
        return toast.error(`${service} is 0 on every day. Give it at least one day, or untick it.`);
      }
    }
    const days: ServiceHours[] = [...offered].map((service) => {
      const on = workingDays.filter((d) => Number(countOf(service, d)) > 0);
      return {
        service, days: on, start: null, end: null,
        dayLimits: Object.fromEntries(on.map((d) => [String(d), Number(countOf(service, d))])),
      };
    });
    setSavingServices(true);
    try {
      // The days first: if they can't be saved, nothing else is changed either.
      await saveServiceHours(id, days);
      await saveDentistServices(id, [...offered]);
      // The numbers now live with each day; the old same-every-day limits are cleared.
      await saveServiceLimits(id, []);
      setSavedServices(servicesKey(offered, limitDrafts, workingDays));
      toast.success("Services, limits and days saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save services and limits");
    } finally {
      setSavingServices(false);
    }
  };

  // Approving leave (or a change to it) adds or frees Unavailable Dates: read them again.
  useEffect(() => {
    if (!id) return;
    const reload = () => { getDentistSchedule(id).then((sch) => setUnavailableList(sch.unavailable)).catch(() => {}); };
    window.addEventListener(LEAVE_CHANGED, reload);
    return () => window.removeEventListener(LEAVE_CHANGED, reload);
  }, [id]);

  const removeLeave = async (leaveId: string) => {
    try {
      await removeDentistUnavailable(leaveId);
      setUnavailableList((list) => list.filter((u) => u.id !== leaveId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove unavailable date");
    }
  };

  // Back to wherever the superadmin came from: Staff Management or the team Schedule.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/superadmin/staff"));
  // An admin has working days, hours and leave too, but no appointment slots or services.
  const isAdmin = dentist?.role === "admin";

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Whose schedule this is: back, photo, name, employee ID — straight on the page. */}
      <div>
          <Button variant="ghost" size="icon" className="-ml-2 mb-2" onClick={back} aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-4 sm:gap-5">
            {dentist && <DentistAvatar d={{ name: dentist.name, photoUrl: dentist.photoUrl ?? null }} className="w-16 h-16 sm:w-20 sm:h-20 text-xl sm:text-2xl" />}
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground break-words">{dentist?.name ?? "Schedule"}</h1>
              {dentist?.employeeId && <p className="font-mono text-sm text-muted-foreground">{dentist.employeeId}</p>}
            </div>
          </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Working Days &amp; Hours</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Tick the days this admin works, and set the hours and lunch break."
              : "Tick the days this dentist works, and set the hours, lunch break, slot length and patients per day."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table className={COMPACT_TABLE}>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead className={CODE_COL}>Start</TableHead>
                  <TableHead className={CODE_COL}>End</TableHead>
                  <TableHead className={CODE_COL}>Lunch Start</TableHead>
                  <TableHead className={CODE_COL}>Lunch End</TableHead>
                  {!isAdmin && <TableHead className={NUM_COL}>Duration (min)</TableHead>}
                  {!isAdmin && <TableHead className={NUM_COL}>Max/Day</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayConfigs.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox checked={c.enabled} onCheckedChange={(checked) => updateDay(i, { enabled: !!checked })} />
                        {DAY_NAMES[i].slice(0, 3)}
                      </label>
                    </TableCell>
                    <TableCell className={CODE_COL}><Input type="time" className="w-28" disabled={!c.enabled} value={c.start} onChange={e => updateDay(i, { start: e.target.value })} aria-label={`${DAY_NAMES[i]} start`} /></TableCell>
                    <TableCell className={CODE_COL}><Input type="time" className="w-28" disabled={!c.enabled} value={c.end} onChange={e => updateDay(i, { end: e.target.value })} aria-label={`${DAY_NAMES[i]} end`} /></TableCell>
                    <TableCell className={CODE_COL}><Input type="time" className="w-28" disabled={!c.enabled} value={c.lunchStart} onChange={e => updateDay(i, { lunchStart: e.target.value })} aria-label={`${DAY_NAMES[i]} lunch start`} /></TableCell>
                    <TableCell className={CODE_COL}><Input type="time" className="w-28" disabled={!c.enabled} value={c.lunchEnd} onChange={e => updateDay(i, { lunchEnd: e.target.value })} aria-label={`${DAY_NAMES[i]} lunch end`} /></TableCell>
                    {!isAdmin && <TableCell className={NUM_COL}><Input type="number" min={10} step={5} className="w-20 text-right" disabled={!c.enabled} value={c.duration} onChange={e => updateDay(i, { duration: Number(e.target.value) })} aria-label={`${DAY_NAMES[i]} slot length`} /></TableCell>}
                    {!isAdmin && <TableCell className={NUM_COL}><Input type="number" min={1} className="w-20 text-right" disabled={!c.enabled} value={c.maxPatients} onChange={e => updateDay(i, { maxPatients: Number(e.target.value) })} aria-label={`${DAY_NAMES[i]} patients per day`} /></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!isAdmin && <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-sm font-medium mb-2">Automatically generated slots (preview of {previewDay >= 0 ? DAY_NAMES[previewDay] : "—"})</p>
            {previewSlots.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {previewSlots.map(s => <Badge key={s.value} variant="outline" className="bg-background">{s.label}</Badge>)}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No slots can be generated with the current setup.</p>
            )}
          </div>}
          <SectionSave dirty={daysDirty} saving={savingDays} onSave={saveDays} label="Save Working Days" />
        </CardContent>
      </Card>

      {!isAdmin && <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" /> Services, Daily Limits &amp; Days</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tick the services this dentist offers — patients only see them as a choice for those.{" "}
            <span className="font-medium text-foreground">{offered.size === 0 ? "None ticked: offers every service." : `Offers ${offered.size} of ${serviceNames.length}.`}</span>{" "}
            For each ticked service, enter how many they take on each working day (0 = not that day).
          </p>
        </CardHeader>
        <CardContent>
          {serviceNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services yet. Add them in System Settings › Dental Services &amp; Pricing.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className={COMPACT_TABLE}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[7.5rem] bg-card sm:min-w-[9rem]">Service</TableHead>
                    <TableHead className="w-20 text-center">Offered</TableHead>
                    {tableDays.map((d) => {
                      const works = workingDays.includes(d);
                      return (
                        <TableHead key={d} className={cn("w-[4.75rem] text-center", !works && "bg-muted/50")}>
                          <Hint label={works ? `${DAY_NAMES[d]}: a working day` : `${DAY_NAMES[d]}: not a working day`}>
                            <span className={cn(
                              "inline-block rounded-md px-2 py-0.5",
                              works ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground/50",
                            )}>
                              {DAY_NAMES[d].slice(0, 3)}
                            </span>
                          </Hint>
                          {!works && <span className="block text-[10px] font-normal text-muted-foreground/60">Day off</span>}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceNames.map(name => {
                    const ticked = offered.has(name);
                    return (
                      <TableRow key={name} className={cn(ticked && "bg-primary/5")}>
                        {/* Pinned, so the name stays in view while the days scroll on a phone. */}
                        <TableCell className={cn("sticky left-0 z-10 bg-card text-sm", ticked && "bg-gradient-to-r from-primary/5 to-primary/5 font-medium")}>
                          {name}
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={ticked}
                            onCheckedChange={(v) => {
                              setOffered((o) => {
                                const next = new Set(o);
                                if (v) next.add(name); else next.delete(name);
                                return next;
                              });
                              // Not offered: its numbers go too.
                              if (!v) setLimitDrafts((all) => ({ ...all, [name]: {} }));
                            }}
                            aria-label={`${name}: offered by this dentist`}
                          />
                        </TableCell>
                        {tableDays.map((d) => {
                          const works = workingDays.includes(d);
                          const value = countOf(name, d);
                          return (
                            <TableCell key={d} className={cn("p-1 text-center", !works && "bg-muted/50")}>
                              {works && ticked ? (
                                <input
                                  aria-label={`How many ${name} on ${DAY_NAMES[d]}`}
                                  aria-invalid={value === ""}
                                  required
                                  inputMode="numeric"
                                  className={cn(
                                    "mx-auto block h-8 w-[4.25rem] rounded-md border bg-background text-center text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                    value === "" ? "border-destructive bg-destructive/5"
                                      : value === "0" ? "border-input text-muted-foreground" : "border-primary text-foreground",
                                  )}
                                  value={value}
                                  onChange={e => {
                                    const v = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
                                    setLimitDrafts((all) => ({ ...all, [name]: { ...all[name], [String(d)]: v } }));
                                  }}
                                />
                              ) : (
                                // Not offered, or not a working day: nothing to enter.
                                <span className="mx-auto flex h-8 w-[4.25rem] cursor-not-allowed items-center justify-center text-muted-foreground/40" aria-hidden>—</span>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Every working day of a ticked service needs a number: how many they take that day, or <span className="font-medium">0</span> if
            they don't do it then. Boxes in red still need one. Greyed days aren't working days; set those above.
          </p>
          <SectionSave dirty={servicesDirty} saving={savingServices} onSave={saveServices} label="Save Services, Limits & Days" />
        </CardContent>
      </Card>}

      {/* Their leave as a record, as they see it on My Schedule; it's decided on the Schedule page. */}
      <StaffLeave dentistId={id} daysOff={unavailableList} onRemoveDayOff={removeLeave} />

    </div>
  );
}

/** A section's contents in a form that compares equal exactly when nothing has changed. */
function daysKey(configs: DayConfig[]): string {
  return JSON.stringify(configs.map((c) => (c.enabled ? c : { enabled: false })));
}
function servicesKey(offered: Set<string>, limits: Record<string, Record<string, string>>, workingDays: number[]): string {
  const ticked = [...offered].sort();
  return JSON.stringify({
    offered: ticked,
    // Only a ticked service's numbers, on the working days, are saved.
    counts: ticked.map((service) => [service, workingDays.map((d) => limits[service]?.[String(d)] ?? "")]),
  });
}

/** The foot of a section: its own Save, and whether it has changes still to save. */
function SectionSave({ dirty, saving, onSave, label }: { dirty: boolean; saving: boolean; onSave: () => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4 mt-4">
      {dirty ? (
        <span className="mr-auto flex items-center gap-1.5 text-xs font-medium text-warning">
          <span className="w-2 h-2 rounded-full bg-warning" aria-hidden /> Unsaved changes
        </span>
      ) : (
        <span className="mr-auto text-xs text-muted-foreground">All changes saved</span>
      )}
      <Button className="gradient-primary text-primary-foreground w-full sm:w-auto" onClick={onSave} disabled={saving || !dirty}>
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{label}
      </Button>
    </div>
  );
}
