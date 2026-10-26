import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { toast } from "sonner";
import { getDentistSchedule, DAY_NAMES, isWholeDay, type DentistScheduleData } from "@/lib/api/staff";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { addDays, addWeeks, format, isSameDay, startOfWeek } from "date-fns";
import TruncatedText from "@/components/TruncatedText";
import { MyLeave } from "@/components/LeaveRequests";
import { LEAVE_CHANGED, LEAVE_PRINT_COLUMNS, getLeave, leaveHours, leaveLines, leavePrintRow, type LeaveRequest } from "@/lib/api/leave";
import { cn } from "@/lib/utils";
import { manilaTodayAsLocalDate } from "@/lib/formatDate";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Palmtree,
  UtensilsCrossed,
  Loader2,
  Printer,
} from "lucide-react";

function formatTimeRange(start: string, end: string) {
  return `${toLabel(toMinutes(start))} - ${toLabel(toMinutes(end))}`;
}

export default function DentistSchedule() {
  const { user } = useAuth();
  // Admins have a schedule here too; slot length only means something for a dentist.
  const isDentist = user?.role === "dentist";
  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = () => getDentistSchedule(user.id)
      .then(setSchedule)
      .catch(() => toast.error("Failed to load your schedule"))
      .finally(() => setLoading(false));
    load();
    // Leave changing (cancelled, or decided elsewhere) can change the days off.
    window.addEventListener(LEAVE_CHANGED, load);
    return () => window.removeEventListener(LEAVE_CHANGED, load);
  }, [user]);

  const days = [...(schedule?.days ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const leave = useMemo(() => schedule?.unavailable ?? [], [schedule]);
  // The week on show, this one to begin with; each of its days with any leave on it.
  const today = manilaTodayAsLocalDate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekLabel = `${format(week[0], "MMM d")} – ${format(week[6], "MMM d, yyyy")}`;
  const leaveOn = useMemo(() => new Map(leave.map((u) => [u.date, u])), [leave]);

  // Their own leave requests, for the printed leave table (the Leave card loads its own).
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    // An admin's list also carries colleagues' approved leave; only theirs prints.
    const load = () => { getLeave().then((l) => setRequests(l.filter((x) => x.dentistId === userId))).catch(() => {}); };
    load();
    window.addEventListener(LEAVE_CHANGED, load);
    return () => window.removeEventListener(LEAVE_CHANGED, load);
  }, [userId]);

  // What the page shows, on paper: the week on show a day at a time (leave in it), then
  // the Leave table as it stands.
  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Clinic Schedule",
      filters: [
        { label: "Week", value: weekLabel },
        { label: "Working Days", value: days.map(d => DAY_NAMES[d.dayOfWeek]).join(", ") || "None" },
      ],
      tables: [
        {
          heading: "Weekly Schedule",
          showCount: false,
          columns: ["Day", "Date", "Working Hours", "Lunch Break", "Leave"],
          rows: week.map((date) => {
            const d = days.find((x) => x.dayOfWeek === date.getDay());
            const found = leaveOn.get(format(date, "yyyy-MM-dd"));
            const whole = found && isWholeDay(found);
            const leaveText = found
              ? [whole ? "On leave" : `Leave ${leaveHours(found)}`, found.reason].filter(Boolean).join(" · ")
              : "—";
            return [
              DAY_NAMES[date.getDay()],
              format(date, "MMM d, yyyy"),
              whole ? "—" : d ? formatTimeRange(d.start, d.end) + (isDentist ? ` (${d.duration} min)` : "") : "Off",
              whole || !d ? "—" : d.lunchStart && d.lunchEnd ? formatTimeRange(d.lunchStart, d.lunchEnd) : "None",
              leaveText,
            ];
          }),
        },
        {
          heading: "Leave",
          columns: LEAVE_PRINT_COLUMNS,
          rows: (leaveLines(requests, leave) ?? []).map(leavePrintRow),
          emptyText: "No leave yet.",
        },
      ],
    });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">My Schedule</h1>
          <p className="text-muted-foreground">Your assigned clinic schedule and leave calendar</p>
        </div>
        {/* Nothing to print until the schedule is there to print. */}
        {days.length > 0 && (
          <Button onClick={handlePrint} disabled={loading} variant="outline" className="print:hidden">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : days.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            No schedule found for your account. Please contact the Super Admin.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* One week at a time, with its dates: each day's hours and lunch, days off as
              such, leave in place of the hours, today picked out. */}
          <Card className="shadow-card">
            <CardHeader className="pb-3 space-y-3">
              <div>
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" /> Weekly Schedule
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {days.length} working day{days.length === 1 ? "" : "s"}{isDentist && days[0] ? ` · ${days[0].duration}-minute slots` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous week" onClick={() => setWeekStart((w) => addWeeks(w, -1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="min-w-[11rem] text-center text-sm font-medium">{weekLabel}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next week" onClick={() => setWeekStart((w) => addWeeks(w, 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {!isSameDay(weekStart, startOfWeek(today)) && (
                  <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(today))}>This week</Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border">
                <div className="hidden sm:grid grid-cols-[9rem_1fr_1fr_1fr] gap-4 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <span>Day</span>
                  <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Working Hours</span>
                  <span className="flex items-center gap-1.5"><UtensilsCrossed className="h-3.5 w-3.5" /> Lunch Break</span>
                  <span className="flex items-center gap-1.5"><Palmtree className="h-3.5 w-3.5" /> Leave Reason</span>
                </div>
                <ul className="divide-y" aria-label="Weekly schedule">
                  {week.map((date) => {
                    const dow = date.getDay();
                    const name = DAY_NAMES[dow];
                    const d = days.find((x) => x.dayOfWeek === dow);
                    const isToday = isSameDay(date, today);
                    const found = leaveOn.get(format(date, "yyyy-MM-dd"));
                    // Leave for the whole day replaces it; leave for some hours sits beside them.
                    const away = found && isWholeDay(found) ? found : undefined;
                    const partAway = found && !isWholeDay(found) ? found : undefined;
                    return (
                      <li key={name} className={cn(
                        "grid grid-cols-[6.5rem_1fr] sm:grid-cols-[9rem_1fr_1fr_1fr] items-center gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm",
                        isToday && "bg-primary/5",
                      )}>
                        <span className={cn("font-medium", !d && !away && "text-muted-foreground")}>
                          <span className="flex items-center gap-2">
                            {name}
                            {isToday && <Badge className="h-5 bg-primary px-1.5 text-[10px] text-primary-foreground hover:bg-primary">Today</Badge>}
                          </span>
                          <span className="block text-xs font-normal text-muted-foreground">{format(date, "MMM d")}</span>
                        </span>
                        {away ? (
                          // Leave stands in place of the hours and lunch that day; why, in its own column.
                          <>
                            <span><Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">On leave</Badge></span>
                            <span className="hidden sm:block text-muted-foreground">—</span>
                            <span className="col-start-2 sm:col-start-auto min-w-0 text-muted-foreground">
                              {away.reason ? <TruncatedText text={away.reason} more={away.remarks} /> : "No reason given"}
                            </span>
                          </>
                        ) : d ? (
                          <>
                            <span className="min-w-0 font-medium text-foreground">
                              {formatTimeRange(d.start, d.end)}
                              {isDentist && d.duration !== days[0].duration && <span className="text-muted-foreground font-normal"> · {d.duration} min</span>}
                              {/* Leave for some hours sits under the hours it takes from; on a narrow column its hours drop under "Leave". */}
                              {partAway && (
                                <Badge variant="outline" className="mt-1 flex w-fit max-w-full flex-wrap gap-x-1 rounded-md bg-destructive/10 text-destructive border-destructive/20">
                                  <span>Leave</span>
                                  <span className="whitespace-nowrap">{leaveHours(partAway)}</span>
                                </Badge>
                              )}
                            </span>
                            <span className="col-start-2 sm:col-start-auto text-muted-foreground">
                              <UtensilsCrossed className="mr-1.5 inline h-3.5 w-3.5 sm:hidden" />
                              {d.lunchStart && d.lunchEnd ? formatTimeRange(d.lunchStart, d.lunchEnd) : "No lunch break"}
                            </span>
                            {partAway?.reason && (
                              <span className="col-start-2 sm:col-start-auto min-w-0 text-muted-foreground">
                                <TruncatedText text={partAway.reason} more={partAway.remarks} />
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground sm:col-span-3">Off</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Leave in one card: asking for it, and every request and day off with how it stands. */}
      <MyLeave daysOff={leave} />
    </div>
  );
}
