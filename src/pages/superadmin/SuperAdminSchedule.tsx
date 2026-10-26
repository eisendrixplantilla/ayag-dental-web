import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, addWeeks, format, isSameDay, parseISO, startOfWeek } from "date-fns";
import { AlertTriangle, CalendarClock, CalendarRange, ChevronLeft, ChevronRight, CalendarMinus, Eye, History, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import TablePagination from "@/components/TablePagination";
import Hint from "@/components/Hint";
import TruncatedText from "@/components/TruncatedText";
import Segmented from "@/components/Segmented";
import { ChangeLeave, ChangeNote, DecideLeave, FileLeave, LeaveDetails, RemovedDays, RequestedAt } from "@/components/LeaveRequests";
import { IconAction, RowActions } from "@/components/RowActions";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { COMPACT_TABLE, PIN_COL, WRAP_CELL, CODE_COL } from "@/lib/tableClass";
import { cn } from "@/lib/utils";
import { manilaTodayAsLocalDate } from "@/lib/formatDate";
import { toKey, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { getAllSchedules, getStaff, isWholeDay, type DentistScheduleData, type StaffMember } from "@/lib/api/staff";
import { describeChange, getLeave, leaveHours, LEAVE_CHANGED, LEAVE_PRINT_COLUMNS, leavePrintRow, pendingChange, type LeaveRequest } from "@/lib/api/leave";

type RoleFilter = "all" | "dentist" | "admin";
const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "dentist", label: "Dentists" },
  { value: "admin", label: "Admins" },
];

/** What one person is doing on one day of the week on show. */
type DayCell =
  // A working day; `leave` when they're away for some hours of it.
  | { kind: "work"; start: string; end: string; leave?: { hours: string; reason: string | null } }
  | { kind: "leave"; reason: string | null }
  | { kind: "off" };

function cellFor(schedule: DentistScheduleData | undefined, date: Date): DayCell {
  const away = schedule?.unavailable.filter((u) => u.date === toKey(date)) ?? [];
  const whole = away.find(isWholeDay);
  if (whole) return { kind: "leave", reason: whole.reason };
  const day = schedule?.days.find((d) => d.dayOfWeek === date.getDay());
  if (!day) return { kind: "off" };
  const part = away[0];
  return { kind: "work", start: day.start, end: day.end, ...(part ? { leave: { hours: leaveHours(part)!, reason: part.reason } } : {}) };
}

const cellText = (c: DayCell) =>
  c.kind === "work" ? `${toLabel(toMinutes(c.start))} – ${toLabel(toMinutes(c.end))}${c.leave ? ` (leave ${c.leave.hours})` : ""}`
    : c.kind === "leave" ? `On leave${c.reason ? ` (${c.reason})` : ""}`
    : "Off";

/** "Nov 3 – Nov 5" or "Nov 3". */
const leaveDays = (l: LeaveRequest) => {
  const from = format(parseISO(l.startDate), "MMM d");
  return l.startDate === l.endDate ? from : `${from} – ${format(parseISO(l.endDate), "MMM d")}`;
};

/**
 * The whole team's week at a glance: who works when, who's off, who's on leave, with the
 * leave still waiting for a decision on top. Each person opens their own schedule to edit.
 */
export default function SuperAdminSchedule() {
  const navigate = useNavigate();
  const today = manilaTodayAsLocalDate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [role, setRole] = useState<RoleFilter>("all");
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  // Null while still loading: the names show first, their days fill in when this arrives.
  const [schedules, setSchedules] = useState<Record<string, DentistScheduleData> | null>(null);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  // Approved leave whose days the superadmin is taking off.
  const [changing, setChanging] = useState<LeaveRequest | null>(null);
  const [viewing, setViewing] = useState<LeaveRequest | null>(null);
  const todayKey = toKey(today);

  useEffect(() => {
    let live = true;
    // The staff and everyone's schedules load side by side, each in one request.
    const loadSchedules = () => {
      getStaff()
        .then((list) => {
          if (!live) return;
          const team = (Array.isArray(list) ? list : []).filter((s) => s.role === "dentist" || s.role === "admin");
          setStaff(team.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)));
        })
        .catch(() => { if (live) { setStaff((s) => s ?? []); toast.error("Failed to load the staff"); } });
      getAllSchedules()
        .then((all) => { if (live) setSchedules(all); })
        .catch(() => { if (live) { setSchedules((s) => s ?? {}); toast.error("Failed to load the staff schedules"); } });
    };
    const loadLeave = () => getLeave().then((l) => { if (live) setLeave(Array.isArray(l) ? l : []); }).catch(() => {});
    // Leave added or decided here turns into days off on the grid, so both are read again.
    const reload = () => { loadSchedules(); loadLeave(); };
    reload();
    window.addEventListener(LEAVE_CHANGED, reload);
    return () => { live = false; window.removeEventListener(LEAVE_CHANGED, reload); };
  }, []);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const shown = useMemo(() => (staff ?? []).filter((s) => role === "all" || s.role === role), [staff, role]);
  const { page, setPage, paged } = usePagination(shown, role);
  // New requests, and approved leave its owner asks to change.
  const pending = leave.filter((l) => l.status === "pending" || pendingChange(l));
  // Every request, newest first, for the role on show.
  const history = useMemo(
    () => leave.filter((l) => role === "all" || l.role === role).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [leave, role],
  );
  const { page: historyPage, setPage: setHistoryPage, paged: historyPaged } = usePagination(history, role);

  const weekLabel = `${format(week[0], "MMM d")} – ${format(week[6], "MMM d, yyyy")}`;

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Staff Schedule",
      filters: [
        { label: "Week", value: weekLabel },
        { label: "Showing", value: ROLE_FILTERS.find((r) => r.value === role)!.label },
      ],
      tables: [{
        heading: "Weekly Schedule",
        showCount: false,
        columns: ["Name", "Role", ...week.map((d) => format(d, "EEE MMM d"))],
        rows: shown.map((s) => [s.name, s.role === "dentist" ? "Dentist" : "Admin", ...week.map((d) => cellText(cellFor(schedules?.[s.id], d)))]),
        emptyText: "No staff to show.",
      }, {
        // All Leave, as the table shows it: newest first, for the role on show.
        heading: "All Leave",
        columns: ["Name", "Role", ...LEAVE_PRINT_COLUMNS, "Decided By"],
        rows: history.map((l) => [
          l.dentistName, l.role === "dentist" ? "Dentist" : "Admin",
          ...leavePrintRow({ kind: "request", key: l.id, sortDate: l.createdAt, l }), l.decidedBy ?? "—",
        ]),
        emptyText: "No leave yet.",
      }],
    });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Schedule</h1>
          <p className="text-muted-foreground">Dentists' and admins' working days, hours and leave</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden" disabled={!staff}>
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      {pending.length > 0 && (
        <Card className="shadow-card border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <CalendarRange className="w-4 h-4 text-warning" /> Leave Waiting for Approval
              <Badge className="bg-warning text-warning-foreground">{pending.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {l.dentistName}{" "}
                    <Badge variant="outline" className="ml-1 align-middle">{l.role === "dentist" ? "Dentist" : "Admin"}</Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{leaveDays(l)}{leaveHours(l) ? `, ${leaveHours(l)}` : ""} · {l.reason}{l.note ? ` — ${l.note}` : ""}</p>
                  {pendingChange(l) && (
                    <p className="mt-1 text-xs text-warning">
                      Approved leave: asks to {describeChange(l.changeRequest!)}{l.changeRequest!.note ? ` (${l.changeRequest!.note})` : ""}
                    </p>
                  )}
                  {l.conflicts.length > 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {l.conflicts.length} appointment{l.conflicts.length === 1 ? "" : "s"} to move first
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <IconAction label="View details" icon={Eye} ariaLabel={`View ${l.dentistName}'s leave`} onClick={() => setViewing(l)} />
                  <DecideLeave l={l} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="font-heading text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> Weekly Schedule
            </CardTitle>
            <Segmented label="Whose schedule" value={role} onChange={setRole} options={ROLE_FILTERS} />
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
        <CardContent className="overflow-x-auto">
          {!staff ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <Table className={COMPACT_TABLE}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={PIN_COL}>Name</TableHead>
                    {week.map((d) => (
                      <TableHead key={d.toISOString()} className={`${cn(isSameDay(d, today) && "bg-primary/10 text-primary")} ${CODE_COL}`}>
                        <span className="block">{format(d, "EEE")}</span>
                        <span className="block text-xs font-normal">{format(d, "MMM d")}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No staff to show.</TableCell></TableRow>
                  )}
                  {paged.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className={cn("font-medium", WRAP_CELL, PIN_COL)}>
                        {/* Opens their schedule, to change hours or decide on leave. */}
                        <button type="button" className="text-left text-primary hover:underline" onClick={() => navigate(`/superadmin/staff/${s.employeeId ?? s.id}/schedule`, { state: { id: s.id } })}>
                          {s.name}
                        </button>
                        <span className="block text-xs font-normal text-muted-foreground">{s.role === "dentist" ? "Dentist" : "Admin"}</span>
                      </TableCell>
                      {week.map((d) => {
                        const c = cellFor(schedules?.[s.id], d);
                        return (
                          <TableCell key={d.toISOString()} className={`${cn("text-xs", isSameDay(d, today) && "bg-primary/5")} ${CODE_COL}`}>
                            {!schedules ? (
                              <Skeleton className="h-7 w-14" data-testid="cell-loading" />
                            ) : c.kind === "work" ? (
                              <span className="whitespace-nowrap">
                                <span className="block">{toLabel(toMinutes(c.start))}</span>
                                <span className="block text-muted-foreground">– {toLabel(toMinutes(c.end))}</span>
                                {c.leave && (
                                  <Hint label={`On leave ${c.leave.hours}${c.leave.reason ? ` · ${c.leave.reason}` : ""}`}>
                                    <span tabIndex={0} className="mt-1 inline-flex cursor-help">
                                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 px-1.5 text-[10px]">Leave {c.leave.hours}</Badge>
                                    </span>
                                  </Hint>
                                )}
                              </span>
                            ) : c.kind === "leave" ? (
                              <Hint label={c.reason || "No reason given"}>
                                <span tabIndex={0} className="inline-flex cursor-help">
                                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 whitespace-nowrap">On leave</Badge>
                                </span>
                              </Hint>
                            ) : (
                              <span className="text-muted-foreground/60">Off</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={page} onPageChange={setPage} total={shown.length} pageSize={PAGE_SIZE} noun="staff" />
            </>
          )}
        </CardContent>
      </Card>

      <FileLeave staff={staff ?? []} />
      <ChangeLeave leave={changing} direct onClose={() => setChanging(null)} />
      <LeaveDetails leave={viewing} who="superadmin" onClose={() => setViewing(null)} />

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <History className="w-5 h-5 text-primary" /> All Leave
          </CardTitle>
          <p className="text-sm text-muted-foreground">Every request, newest first. The filter above applies here too.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead className={PIN_COL}>Staff</TableHead>
                <TableHead className={CODE_COL}>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className={CODE_COL}>Requested</TableHead>
                <TableHead className={CODE_COL}>Status</TableHead>
                <TableHead>Decided By</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leave yet.</TableCell></TableRow>
              )}
              {historyPaged.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className={cn("font-medium", WRAP_CELL, PIN_COL)}>
                    {l.dentistName}
                    <span className="block text-xs font-normal text-muted-foreground">{l.role === "dentist" ? "Dentist" : "Admin"}</span>
                  </TableCell>
                  <TableCell className={`whitespace-nowrap ${CODE_COL}`}>
                    {leaveDays(l)}
                    {leaveHours(l) && <span className="block text-xs text-muted-foreground">{leaveHours(l)}</span>}
                    <RemovedDays l={l} />
                  </TableCell>
                  <TableCell className="max-w-[14rem]">
                    <TruncatedText text={l.reason} more={l.status === "rejected" ? `Rejected: ${l.decisionReason ?? ""}` : l.note} />
                    <ChangeNote l={l} />
                  </TableCell>
                  <TableCell className={CODE_COL}><RequestedAt at={l.createdAt} /></TableCell>
                  <TableCell className={CODE_COL}>
                    <Badge variant="outline" className={cn("capitalize", LEAVE_STATUS_STYLE[l.status])}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className={WRAP_CELL}>{l.decidedBy ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <RowActions>
                      <IconAction label="View details" icon={Eye} ariaLabel={`View ${l.dentistName}'s leave`} onClick={() => setViewing(l)} />
                      {/* Approved leave with days still to come can be cut short, or called off. */}
                      {l.status === "approved" && l.endDate >= todayKey ? (
                        <IconAction label="Remove days" icon={CalendarMinus} ariaLabel={`Remove days from ${l.dentistName}'s leave`} onClick={() => setChanging(l)} />
                      ) : (
                        // Keeps View in line with the rows that have a second action.
                        <span className="h-8 w-8" aria-hidden />
                      )}
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={historyPage} onPageChange={setHistoryPage} total={history.length} pageSize={PAGE_SIZE} noun="request(s)" />
        </CardContent>
      </Card>
    </div>
  );
}

const LEAVE_STATUS_STYLE: Record<LeaveRequest["status"], string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
};
