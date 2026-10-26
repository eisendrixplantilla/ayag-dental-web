import { useCallback, useEffect, useMemo, useState } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { AlertTriangle, CalendarMinus, CalendarRange, Check, Eye, Loader2, Palmtree, Send, Trash2, Undo2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaStamp, manilaTodayDateStr } from "@/lib/formatDate";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import {
  LEAVE_CHANGED, LEAVE_REASONS, approveLeave, approveLeaveChange, cancelLeave, cancelLeaveChange, describeChange, getLeave, leaveHours,
  leaveLines, leaveSpan, pendingChange, rejectLeave, shortRange, type LeaveLine, rejectLeaveChange, removeLeaveDays, requestLeave, requestLeaveChange, shortenLeave,
  type LeaveConflict, type LeaveRequest, type LeaveStatus,
} from "@/lib/api/leave";
import { DatePicker } from "@/components/DatePicker";
import { Checkbox } from "@/components/ui/checkbox";
import Hint from "@/components/Hint";
import Segmented from "@/components/Segmented";
import { IconAction, RowActions } from "@/components/RowActions";
import TruncatedText from "@/components/TruncatedText";
import TablePagination from "@/components/TablePagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { COMPACT_TABLE, CODE_COL } from "@/lib/tableClass";
import type { UnavailableDate } from "@/lib/api/staff";

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground",
};

/** "Nov 3 – Nov 5, 2026 · 3 days", or one day on its own. */
function describeDates(l: Pick<LeaveRequest, "startDate" | "endDate"> & Partial<Pick<LeaveRequest, "startTime" | "endTime">>): string {
  const from = parseISO(l.startDate);
  const to = parseISO(l.endDate);
  const days = differenceInCalendarDays(to, from) + 1;
  const hours = leaveHours(l);
  if (hours) return `${format(from, "EEE, MMM d, yyyy")} · ${hours}`;
  if (days === 1) return format(from, "EEE, MMM d, yyyy");
  return `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")} · ${days} days`;
}

/** Newest first, but anything still waiting on a decision (a request, or a change to one) on top. */
const waiting = (l: LeaveRequest) => l.status === "pending" || !!pendingChange(l);
const byPendingThenNewest = (a: LeaveRequest, b: LeaveRequest) =>
  Number(waiting(b)) - Number(waiting(a)) || b.createdAt.localeCompare(a.createdAt);

/** The bookings standing in the way of approving, one per line. */
function Conflicts({ conflicts, who }: { conflicts: LeaveConflict[]; who: "dentist" | "superadmin" }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground space-y-1">
      <p className="flex items-start gap-1.5 font-medium">
        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0 text-warning" />
        {conflicts.length} appointment{conflicts.length === 1 ? "" : "s"} on these days must be rescheduled or cancelled
        {who === "superadmin" ? " before this can be approved." : " before it can be approved."}
      </p>
      <ul className="pl-5 list-disc text-muted-foreground">
        {conflicts.map((c) => (
          <li key={c.id}>{c.patientName} — {format(parseISO(c.date), "EEE, MMM d")}, {toLabel(toMinutes(c.time))} ({c.status})</li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        {who === "superadmin" ? "Ask the front desk to move them, then approve." : "The front desk can move them for you."}
      </p>
    </div>
  );
}

/** When a request was sent, on two lines: "Oct 26, 2026" over "9:14 AM" (Manila time). */
export function RequestedAt({ at }: { at: string }) {
  const stamp = formatManilaStamp(at);
  const cut = stamp.lastIndexOf(", ");
  return (
    <span className="whitespace-nowrap">
      {stamp.slice(0, cut)}
      <span className="block text-xs text-muted-foreground">{stamp.slice(cut + 2)}</span>
    </span>
  );
}

/** "2 days removed" under leave the superadmin cut short, the days themselves on hover. */
export function RemovedDays({ l }: { l: Pick<LeaveRequest, "removedDates"> }) {
  const n = l.removedDates.length;
  if (n === 0) return null;
  const days = l.removedDates.map((d) => format(parseISO(d), "MMM d")).join(", ");
  return (
    <Hint label={`Removed: ${days}`}>
      <span tabIndex={0} className="block cursor-help text-xs font-normal text-muted-foreground underline decoration-dotted underline-offset-2">
        {n} day{n === 1 ? "" : "s"} removed
      </span>
    </Hint>
  );
}

/**
 * Every day of a leave with a tick box: days removed before, or already past, can't be
 * ticked. Used by the superadmin removing days and by the person asking to work them.
 */
function DayChecklist({ leave, picked, onChange }: { leave: LeaveRequest; picked: string[]; onChange: (days: string[]) => void }) {
  const today = manilaTodayDateStr();
  const removed = new Set(leave.removedDates);
  const days = leaveSpan(leave);
  const open = openDays(leave);
  const toggle = (d: string) => onChange(picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d].sort());
  return (
    <>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{picked.length} of {open.length} selected</span>
        {open.length > 0 && (
          <button type="button" className="font-medium text-primary hover:underline"
            onClick={() => onChange(picked.length === open.length ? [] : open)}>
            {picked.length === open.length ? "Clear" : "Select all"}
          </button>
        )}
      </div>
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1" aria-label="Leave days">
        {days.map((d) => {
          const gone = removed.has(d);
          const past = d < today;
          const id = `leave-day-${d}`;
          return (
            <li key={d} className={cn("flex items-center gap-3 rounded px-2 py-1.5 text-sm", !gone && !past && "hover:bg-muted/60")}>
              <Checkbox id={id} checked={gone || picked.includes(d)} disabled={gone || past} onCheckedChange={() => toggle(d)} />
              <label htmlFor={id} className={cn("flex-1", (gone || past) ? "text-muted-foreground" : "cursor-pointer", gone && "line-through")}>
                {format(parseISO(d), "EEE, MMM d, yyyy")}
              </label>
              {gone && <span className="text-xs text-muted-foreground">Removed</span>}
              {!gone && past && <span className="text-xs text-muted-foreground">Already taken</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Days of a leave still to come that it still covers: what can be removed or asked back. */
function openDays(l: LeaveRequest): string[] {
  const today = manilaTodayDateStr();
  return leaveSpan(l).filter((d) => !l.removedDates.includes(d) && d >= today);
}

/**
 * The superadmin ticking days to take off approved leave: those days are freed for
 * bookings again. Days already past stay (they were taken); with no day left, the leave
 * becomes cancelled.
 */
export function RemoveLeaveDays({ leave, onClose }: { leave: LeaveRequest | null; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPicked([]); }, [leave]);
  if (!leave) return null;

  const left = leaveSpan(leave).filter((d) => !leave.removedDates.includes(d)).length - picked.length;

  const submit = async () => {
    setBusy(true);
    try {
      const updated = await removeLeaveDays(leave.id, picked);
      toast.success(updated.status === "cancelled"
        ? `${leave.dentistName}'s leave was cancelled`
        : `${picked.length} day${picked.length === 1 ? "" : "s"} removed from ${leave.dentistName}'s leave`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the leave");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remove leave days</DialogTitle>
          <DialogDescription>
            {leave.dentistName}: {describeDates(leave)} ({leave.reason}). Tick the days they'll work after all; those days open for bookings again.
          </DialogDescription>
        </DialogHeader>
        <DayChecklist leave={leave} picked={picked} onChange={setPicked} />
        {picked.length > 0 && left === 0 && (
          <p className="text-sm text-warning">No day is left, so the whole leave will be cancelled.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep as is</Button>
          <Button variant="destructive" disabled={picked.length === 0 || busy} onClick={submit}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {picked.length === 0 ? "Remove days"
              : left === 0 ? "Cancel leave"
              : `Remove ${picked.length} day${picked.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Under a leave: the change its owner asked for, while it waits, or, when it was rejected,
 * why (an approved one shows in the leave itself).
 */
export function ChangeNote({ l }: { l: LeaveRequest }) {
  const c = l.changeRequest;
  if (!c) return null;
  if (pendingChange(l)) {
    return (
      <p className="mt-0.5 text-xs text-warning">
        Asked to {describeChange(c)}{c.note ? ` (${c.note})` : ""}: waiting for approval
      </p>
    );
  }
  if (c.status === "rejected") {
    return (
      <p className="mt-0.5 text-xs text-destructive">
        Change to {describeChange(c)} rejected{c.decidedBy ? ` by ${c.decidedBy}` : ""}: {c.decisionReason}
      </p>
    );
  }
  return null;
}

/**
 * A dentist or admin asking to change their approved leave: tick days to work after all,
 * or, on leave for part of a day, keep fewer of its hours. The superadmin decides; until
 * then the leave stays as it is. `direct`: the superadmin changing it, at once (days go
 * through Remove leave days).
 */
export function ChangeLeave({ leave, onClose, direct }: { leave: LeaveRequest | null; onClose: () => void; direct?: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [fewerHours, setFewerHours] = useState(false);
  const [hours, setHours] = useState({ start: "", end: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPicked([]); setNote(""); setFewerHours(false);
    setHours({ start: leave?.startTime ?? "", end: leave?.endTime ?? "" });
  }, [leave]);
  if (!leave) return null;

  const partDay = !!leave.startTime && !!leave.endTime;
  if (direct && !partDay) return <RemoveLeaveDays leave={leave} onClose={onClose} />;
  const left = leaveSpan(leave).filter((d) => !leave.removedDates.includes(d)).length - picked.length;
  // The new hours sit inside the approved ones.
  const times = partDay ? LEAVE_TIMES.filter((t) => t >= leave.startTime! && t <= leave.endTime!) : [];
  const hoursReady = !!hours.start && !!hours.end && hours.end > hours.start
    && (hours.start !== leave.startTime || hours.end !== leave.endTime);
  const ready = partDay && fewerHours ? hoursReady : partDay || picked.length > 0;

  const submit = async () => {
    setBusy(true);
    try {
      if (direct) {
        if (fewerHours) await shortenLeave(leave.id, hours.start, hours.end);
        else await removeLeaveDays(leave.id, [leave.startDate]);
        toast.success(fewerHours ? `${leave.dentistName}'s leave was shortened` : `${leave.dentistName}'s leave was cancelled`);
        onClose();
        return;
      }
      await requestLeaveChange(leave.id,
        partDay && fewerHours ? { startTime: hours.start, endTime: hours.end } : { dates: partDay ? [leave.startDate] : picked },
        note.trim() || undefined);
      toast.success("Change requested. The superadmin will approve or reject it.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the change");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change Leave</DialogTitle>
          <DialogDescription>
            {direct
              ? `${leave.dentistName}: ${describeDates(leave)} (${leave.reason}). Saved at once; they'll get a notification.`
              : `${describeDates(leave)} (${leave.reason}). The superadmin approves or rejects the change; until then your leave stays as it is.`}
          </DialogDescription>
        </DialogHeader>
        {partDay ? (
          <div className="space-y-3">
            <Segmented label="Change" value={fewerHours}
              options={[{ value: false, label: "Work the whole day" }, { value: true, label: "Fewer hours" }]}
              onChange={setFewerHours} />
            {fewerHours && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>From time *</Label>
                  <Select value={hours.start} onValueChange={(start) => setHours((h) => ({ ...h, start }))}>
                    <SelectTrigger aria-label="Leave starts at"><SelectValue placeholder="Start" /></SelectTrigger>
                    <SelectContent className="bg-popover max-h-64">
                      {times.slice(0, -1).map((t) => <SelectItem key={t} value={t}>{toLabel(toMinutes(t))}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>To time *</Label>
                  <Select value={hours.end} onValueChange={(end) => setHours((h) => ({ ...h, end }))}>
                    <SelectTrigger aria-label="Leave ends at"><SelectValue placeholder="End" /></SelectTrigger>
                    <SelectContent className="bg-popover max-h-64">
                      {times.filter((t) => t > hours.start).map((t) => <SelectItem key={t} value={t}>{toLabel(toMinutes(t))}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              {direct
                ? (fewerHours ? "They'll work the rest of those hours, and patients can book them again."
                  : "They'll work all of that day; the leave is cancelled.")
                : fewerHours ? "You'll work the rest of those hours, and patients can book them again."
                : "You'll work all of that day; the leave is cancelled once approved."}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Tick the days you'll work after all.</p>
            <DayChecklist leave={leave} picked={picked} onChange={setPicked} />
            {picked.length > 0 && left === 0 && (
              <p className="text-sm text-warning">No day is left, so the whole leave is cancelled once approved.</p>
            )}
          </>
        )}
        {!direct && (
          <div className="space-y-1.5">
            <Label htmlFor="change-note">Note (optional)</Label>
            <Input id="change-note" value={note} placeholder="Why the change" onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Back</Button>
          <Button className="gradient-primary text-primary-foreground" disabled={!ready || busy} onClick={submit}>
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : direct ? <Check className="w-4 h-4 mr-2" /> : <Send className="w-4 h-4 mr-2" />}
            {direct ? "Save Change" : "Request Change"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5 last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{children}</span>
    </div>
  );
}

/**
 * Everything about one leave: who and when, how it was decided, each of its days as it
 * stands now (on leave, removed, or already taken), and the last change asked for.
 */
export function LeaveDetails({ leave, onClose, who = "dentist" }: {
  leave: LeaveRequest | null; onClose: () => void; who?: "dentist" | "superadmin";
}) {
  if (!leave) return null;
  const l = leave;
  const today = manilaTodayDateStr();
  const removed = new Set(l.removedDates);
  const days = leaveSpan(l);
  const c = l.changeRequest;
  const CHANGE_STYLE = { pending: STATUS_STYLE.pending, approved: STATUS_STYLE.approved, rejected: STATUS_STYLE.rejected };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Leave Details</DialogTitle>
          <DialogDescription>{l.dentistName} · {l.role === "dentist" ? "Dentist" : "Admin"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          <Detail label="Dates">{shortRange(l.startDate, l.endDate)}</Detail>
          <Detail label="Leave for">
            {leaveHours(l) ?? `${days.length} whole day${days.length === 1 ? "" : "s"}`}
            {removed.size > 0 && <span className="block text-xs font-normal text-muted-foreground">{removed.size} removed</span>}
          </Detail>
          <Detail label="Reason">{l.reason}</Detail>
          {l.note && <Detail label="Note">{l.note}</Detail>}
          <Detail label="Status">
            <Badge variant="outline" className={cn("capitalize", STATUS_STYLE[l.status])}>{l.status}</Badge>
          </Detail>
          <Detail label="Requested">{formatManilaStamp(l.createdAt)}</Detail>
          {l.decidedBy && (
            <Detail label={l.status === "rejected" ? "Rejected by" : "Approved by"}>
              {l.decidedBy}{l.decidedAt && <span className="block text-xs font-normal text-muted-foreground">{formatManilaStamp(l.decidedAt)}</span>}
            </Detail>
          )}
          {l.status === "rejected" && l.decisionReason && <Detail label="Why rejected">{l.decisionReason}</Detail>}
          {l.changedBy && (
            <Detail label="Days removed by">
              {l.changedBy}{l.changedAt && <span className="block text-xs font-normal text-muted-foreground">{formatManilaStamp(l.changedAt)}</span>}
            </Detail>
          )}
        </div>

        {l.status === "pending" && l.conflicts.length > 0 && <Conflicts conflicts={l.conflicts} who={who} />}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">Days</p>
          <ul className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm" aria-label="Days of this leave">
            {days.map((d) => {
              const state = removed.has(d) ? "Removed"
                : l.status === "approved" ? (d < today ? "Taken" : "On leave")
                : l.status === "pending" ? "Asked for" : "—";
              return (
                <li key={d} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className={cn(removed.has(d) && "text-muted-foreground line-through")}>{format(parseISO(d), "EEE, MMM d, yyyy")}</span>
                  <span className={cn("text-xs", state === "On leave" ? "text-destructive" : "text-muted-foreground")}>{state}</span>
                </li>
              );
            })}
          </ul>
        </div>

        {c && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">Change asked</p>
              <Badge variant="outline" className={cn("capitalize", CHANGE_STYLE[c.status])}>{c.status}</Badge>
            </div>
            <Detail label="Asked to">{describeChange(c)}</Detail>
            {c.note && <Detail label="Note">{c.note}</Detail>}
            <Detail label="Asked on">{formatManilaStamp(c.requestedAt)}</Detail>
            {c.decidedBy && (
              <Detail label={c.status === "rejected" ? "Rejected by" : "Approved by"}>
                {c.decidedBy}{c.decidedAt && <span className="block text-xs font-normal text-muted-foreground">{formatManilaStamp(c.decidedAt)}</span>}
              </Detail>
            )}
            {c.status === "rejected" && c.decisionReason && <Detail label="Why rejected">{c.decisionReason}</Detail>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Keeps a list of leave requests fresh, including after changes made elsewhere on the page. */
function useLeave(dentistId?: string) {
  const [list, setList] = useState<LeaveRequest[] | null>(null);
  const load = useCallback(() => {
    getLeave(dentistId)
      .then((l) => setList((Array.isArray(l) ? l : []).sort(byPendingThenNewest)))
      .catch(() => setList((l) => l ?? []));
  }, [dentistId]);
  useEffect(() => {
    load();
    window.addEventListener(LEAVE_CHANGED, load);
    return () => window.removeEventListener(LEAVE_CHANGED, load);
  }, [load]);
  return { list, load };
}

/** The times leave for part of a day can start or end: every half hour, 6 AM to 9 PM. */
const LEAVE_TIMES = Array.from({ length: 31 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`;
});

/**
 * From, To, Reason and Note. On My Schedule it asks for the signed-in person; given `staff`
 * (the superadmin's Schedule page) it files leave for whoever is picked there.
 */
function LeaveForm({ staff, onDone, stacked }: {
  staff?: { id: string; name: string; role: string }[];
  /** Called once the leave is sent (to close the dialog it sits in). */
  onDone?: () => void;
  /** In a narrow dialog: two columns at most. */
  stacked?: boolean;
}) {
  const today = manilaTodayDateStr();
  const empty = { staffId: "", startDate: "", endDate: "", reason: "", note: "", partDay: false, startTime: "", endTime: "" };
  const [form, setForm] = useState(empty);
  const [sending, setSending] = useState(false);

  // Part of a day is one day: To follows From.
  const hoursReady = !form.partDay || (!!form.startTime && !!form.endTime && form.endTime > form.startTime);
  const ready = (!staff || !!form.staffId) && !!form.startDate && !!form.endDate && !!form.reason && form.endDate >= form.startDate && hoursReady;

  const submit = async () => {
    if (!ready) return;
    setSending(true);
    try {
      const saved = await requestLeave({
        startDate: form.startDate, endDate: form.endDate, reason: form.reason,
        ...(form.partDay ? { startTime: form.startTime, endTime: form.endTime } : {}),
        note: form.note.trim() || undefined, ...(staff ? { staffId: form.staffId } : {}),
      });
      if (!staff) toast.success("Leave requested. The superadmin will approve or reject it.");
      else if (saved?.status === "approved") toast.success(`Leave added for ${saved.dentistName}. Those days are now Unavailable Dates.`);
      else toast.warning(`Saved, but ${saved?.conflicts.length ?? 0} appointment(s) on those days must be moved before it's approved.`);
      setForm(empty);
      onDone?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the leave");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* With a Staff picker: one row on a desktop (who, why, the two dates, a note), two
          columns on a tablet (who, reason and note on the left, the dates on the right),
          and one column in reading order on a phone. */}
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-3", !stacked && (staff ? "lg:grid-cols-5" : "lg:grid-cols-4"))}>
        {staff && (
          <div className="space-y-1.5 sm:order-1 lg:order-1">
            <Label>Staff *</Label>
            <Select value={form.staffId} onValueChange={(staffId) => setForm((f) => ({ ...f, staffId }))}>
              <SelectTrigger aria-label="Who the leave is for"><SelectValue placeholder="Choose a dentist or admin" /></SelectTrigger>
              <SelectContent className="bg-popover">
                {staff.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.role === "dentist" ? "Dentist" : "Admin"})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={cn("space-y-1.5", staff && "sm:order-2 lg:order-3")}>
          <Label htmlFor="leave-from">From *</Label>
          <DatePicker id="leave-from" min={today} value={form.startDate} required
            onChange={(v) => setForm((f) => ({ ...f, startDate: v, endDate: f.partDay || (f.endDate && f.endDate < v) ? v : f.endDate || v }))} />
        </div>
        <div className={cn("space-y-1.5", staff && "sm:order-4 lg:order-4")}>
          <Label htmlFor="leave-to">To *</Label>
          <DatePicker id="leave-to" min={form.startDate || today} value={form.endDate} required disabled={form.partDay}
            onChange={(v) => setForm((f) => ({ ...f, endDate: v }))} />
        </div>
        <div className={cn("space-y-1.5", staff && "sm:order-3 lg:order-2", stacked && "sm:col-span-2")}>
          <Label>Reason *</Label>
          <Select value={form.reason} onValueChange={(reason) => setForm((f) => ({ ...f, reason }))}>
            <SelectTrigger aria-label="Reason for leave"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
            <SelectContent className="bg-popover">
              {LEAVE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className={cn("space-y-1.5", staff && "sm:order-5 lg:order-5", stacked && "sm:col-span-2")}>
          <Label htmlFor="leave-note">Note (optional)</Label>
          <Input id="leave-note" value={form.note} placeholder="Anything the clinic should know"
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>
      </div>
      {/* Whole days, or some hours of one day (only those hours are closed to bookings). */}
      <div className={cn("grid grid-cols-2 items-end gap-3", stacked ? "" : "sm:grid-cols-[auto_10rem_10rem] sm:justify-start")}>
        <div className={cn("space-y-1.5 col-span-2", !stacked && "sm:col-span-1")}>
          <Label className="block">Leave for</Label>
          <Segmented label="Leave for" value={form.partDay} options={[{ value: false, label: "Whole day" }, { value: true, label: "Part of a day" }]}
            onChange={(partDay) => setForm((f) => ({ ...f, partDay, endDate: partDay ? f.startDate : f.endDate }))} />
        </div>
        {form.partDay && (
          <>
            <div className="space-y-1.5">
              <Label>From time *</Label>
              <Select value={form.startTime} onValueChange={(startTime) => setForm((f) => ({ ...f, startTime }))}>
                <SelectTrigger aria-label="Leave starts at"><SelectValue placeholder="Start" /></SelectTrigger>
                <SelectContent className="bg-popover max-h-64">
                  {LEAVE_TIMES.map((t) => <SelectItem key={t} value={t}>{toLabel(toMinutes(t))}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>To time *</Label>
              <Select value={form.endTime} onValueChange={(endTime) => setForm((f) => ({ ...f, endTime }))}>
                <SelectTrigger aria-label="Leave ends at"><SelectValue placeholder="End" /></SelectTrigger>
                <SelectContent className="bg-popover max-h-64">
                  {LEAVE_TIMES.filter((t) => !form.startTime || t > form.startTime).map((t) => <SelectItem key={t} value={t}>{toLabel(toMinutes(t))}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!ready || sending} className="gradient-primary text-primary-foreground w-full sm:w-auto">
          {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />} {staff ? "Add Leave" : "Request Leave"}
        </Button>
      </div>
    </>
  );
}

/** On the superadmin's Schedule page: leave filed for a dentist or admin, approved at once. */
export function FileLeave({ staff }: { staff: { id: string; name: string; role: string }[] }) {
  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-primary" /> Leave Requests
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add leave for a dentist or admin. It's approved at once, unless appointments on those days still need moving.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <LeaveForm staff={staff} />
      </CardContent>
    </Card>
  );
}

/** On a dentist's or an admin's My Schedule: ask for days off, and follow what was decided. */
/**
 * Leave as one table: Dates, Reason, Requested, Status and Actions, for each request and
 * each day off set directly. The dentist's own My Schedule and the superadmin's page on
 * them both show it; only the actions differ.
 */
function LeaveTable({ lines, empty, requestActions, dayOffActions }: {
  lines: LeaveLine[] | null;
  empty: string;
  requestActions: (l: LeaveRequest) => React.ReactNode;
  dayOffActions?: (d: UnavailableDate) => React.ReactNode;
}) {
  const { page, setPage, paged } = usePagination(lines ?? []);
  if (lines === null) {
    return <p className="py-6 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 inline animate-spin" />Loading…</p>;
  }
  if (lines.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table className={COMPACT_TABLE}>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className={`text-left ${CODE_COL}`}>Dates</TableHead>
              <TableHead className="text-left">Reason</TableHead>
              <TableHead className={`text-left ${CODE_COL}`}>Requested</TableHead>
              <TableHead className={CODE_COL}>Status</TableHead>
              <TableHead className={`w-24 ${CODE_COL}`}>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((line) => line.kind === "dayOff" ? (
              <TableRow key={line.key}>
                <TableCell className={`text-left whitespace-nowrap ${CODE_COL}`}>
                  <span className="font-medium">{shortRange(line.d.date, line.d.date)}</span>
                  <span className="block text-xs text-muted-foreground">{leaveHours(line.d) ?? "Whole day"}</span>
                </TableCell>
                <TableCell className="text-left max-w-[16rem]">
                  {line.d.reason ? <TruncatedText text={line.d.reason} more={line.d.remarks} /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className={`text-left text-muted-foreground ${CODE_COL}`}>Set by the clinic</TableCell>
                <TableCell className={CODE_COL}><Badge variant="outline" className="bg-muted text-muted-foreground">Day off</Badge></TableCell>
                <TableCell className={CODE_COL}>{dayOffActions ? dayOffActions(line.d) : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            ) : (
              <TableRow key={line.key}>
                <TableCell className={`text-left whitespace-nowrap ${CODE_COL}`}>
                  <span className="font-medium">{shortRange(line.l.startDate, line.l.endDate)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {leaveHours(line.l) ?? `${leaveSpan(line.l).length} day${leaveSpan(line.l).length === 1 ? "" : "s"}`}
                  </span>
                  <RemovedDays l={line.l} />
                </TableCell>
                <TableCell className="text-left max-w-[16rem]">
                  <TruncatedText text={line.l.reason} more={line.l.note} />
                  <ChangeNote l={line.l} />
                  {line.l.status === "rejected" && (
                    <p className="text-xs text-destructive">Rejected{line.l.decidedBy ? ` by ${line.l.decidedBy}` : ""}: {line.l.decisionReason}</p>
                  )}
                  {line.l.status === "pending" && line.l.conflicts.length > 0 && (
                    <Hint label={line.l.conflicts.map((c) => `${c.patientName} — ${format(parseISO(c.date), "EEE, MMM d")}, ${toLabel(toMinutes(c.time))}`).join("; ")}>
                      <span tabIndex={0} className="mt-0.5 flex w-fit cursor-help items-center gap-1 text-xs text-warning">
                        <AlertTriangle className="h-3 w-3" /> {line.l.conflicts.length} booking{line.l.conflicts.length === 1 ? "" : "s"} to move first
                      </span>
                    </Hint>
                  )}
                </TableCell>
                <TableCell className={`text-left ${CODE_COL}`}><RequestedAt at={line.l.createdAt} /></TableCell>
                <TableCell className={CODE_COL}>
                  <Badge variant="outline" className={cn("capitalize", STATUS_STYLE[line.l.status])}>{line.l.status}</Badge>
                  {pendingChange(line.l) && (
                    <Badge variant="outline" className={cn("mt-1 whitespace-nowrap", STATUS_STYLE.pending)}>Change pending</Badge>
                  )}
                </TableCell>
                <TableCell className={CODE_COL}>{requestActions(line.l)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} onPageChange={setPage} total={lines.length} pageSize={PAGE_SIZE} noun="item(s)" />
    </>
  );
}

/** Keeps a row's first action in line with rows that have more of them. */
const Spacer = () => <span className="h-8 w-8" aria-hidden />;

/**
 * My Schedule's leave, in one place: asking for days off (in a dialog), and every request
 * with how it stands, plus any day off the clinic set directly (`daysOff` not covered by a
 * request). Dentists and admins both use it.
 */
export function MyLeave({ daysOff = [] }: { daysOff?: UnavailableDate[] }) {
  const { user } = useAuth();
  const { list: all } = useLeave();
  // An admin's list also carries colleagues' approved leave (for the bell); this is theirs only.
  const list = all && all.filter((l) => l.dentistId === user?.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [changing, setChanging] = useState<LeaveRequest | null>(null);
  const [viewing, setViewing] = useState<LeaveRequest | null>(null);
  const lines = useMemo(() => leaveLines(list, daysOff), [list, daysOff]);

  const cancel = async (l: LeaveRequest) => {
    setBusyId(l.id);
    try {
      await cancelLeave(l.id);
      toast.success("Leave request cancelled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel the request");
    } finally {
      setBusyId(null);
    }
  };

  const withdraw = async (l: LeaveRequest) => {
    setBusyId(l.id);
    try {
      await cancelLeaveChange(l.id);
      toast.success("Change request withdrawn");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't withdraw the change");
    } finally {
      setBusyId(null);
    }
  };

  const actions = (l: LeaveRequest) => {
    const dates = shortRange(l.startDate, l.endDate);
    return (
      <RowActions>
        <IconAction label="View details" icon={Eye} ariaLabel={`View leave for ${dates}`} onClick={() => setViewing(l)} />
        {l.status === "pending" ? (
          <IconAction label="Cancel request" icon={busyId === l.id ? Loader2 : X} disabled={busyId === l.id}
            ariaLabel={`Cancel request for ${dates}`} onClick={() => cancel(l)} className="text-destructive hover:text-destructive" />
        ) : pendingChange(l) ? (
          <IconAction label="Withdraw change request" icon={busyId === l.id ? Loader2 : Undo2} disabled={busyId === l.id}
            ariaLabel={`Withdraw change to ${dates}`} onClick={() => withdraw(l)} className="text-destructive hover:text-destructive" />
        ) : l.status === "approved" && openDays(l).length > 0 ? (
          <IconAction label="Ask to change" icon={CalendarMinus} ariaLabel={`Ask to change leave for ${dates}`} onClick={() => setChanging(l)} />
        ) : <Spacer />}
      </RowActions>
    );
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-primary" /> Leave
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.role === "dentist"
                ? "Your days off. Once the superadmin approves leave, patients can't book you on those days."
                : "Your days off. Leave counts once the superadmin approves it."}
            </p>
          </div>
          <Button onClick={() => setAsking(true)} className="gradient-primary text-primary-foreground">
            <Send className="w-4 h-4 mr-2" /> Request Leave
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <LeaveTable lines={lines} empty="No leave yet. Use Request Leave to ask for days off." requestActions={actions} />
      </CardContent>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
            <DialogDescription>The superadmin approves or rejects it; you'll get a notification either way.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <LeaveForm stacked onDone={() => setAsking(false)} />
          </div>
        </DialogContent>
      </Dialog>
      <ChangeLeave leave={changing} onClose={() => setChanging(null)} />
      <LeaveDetails leave={viewing} onClose={() => setViewing(null)} />
    </Card>
  );
}

/**
 * On a dentist's or admin's schedule page: their leave as a record, in the same table they
 * see on My Schedule. Deciding on it happens on the Schedule page; a day off the clinic set
 * directly can still be deleted here.
 */
export function StaffLeave({ dentistId, daysOff, onRemoveDayOff }: {
  dentistId: string;
  daysOff: UnavailableDate[];
  onRemoveDayOff: (id: string) => void;
}) {
  const { list } = useLeave(dentistId);
  const lines = useMemo(() => leaveLines(list, daysOff), [list, daysOff]);
  const [viewing, setViewing] = useState<LeaveRequest | null>(null);
  const [changing, setChanging] = useState<LeaveRequest | null>(null);
  const waiting = list?.filter((l) => l.status === "pending" || pendingChange(l)).length ?? 0;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg flex items-center gap-2">
          <Palmtree className="w-5 h-5 text-primary" /> Leave
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Their leave requests and days off, and how each stands.
          {waiting > 0 && (
            <span className="block text-warning">
              {waiting} waiting for approval: approve or reject {waiting === 1 ? "it" : "them"} on the{" "}
              <Link to="/superadmin/schedule" className="font-medium underline underline-offset-2">Schedule</Link> page.
            </span>
          )}
        </p>
      </CardHeader>
      <CardContent>
        <LeaveTable lines={lines} empty="No leave or days off yet."
          requestActions={(l) => (
            <RowActions>
              <IconAction label="View details" icon={Eye} ariaLabel={`View ${l.dentistName}'s leave for ${shortRange(l.startDate, l.endDate)}`}
                onClick={() => setViewing(l)} />
              {/* Approved leave with days still to come; one they've asked to change is decided on the Schedule page first. */}
              {l.status === "approved" && openDays(l).length > 0 && !pendingChange(l) ? (
                <IconAction label="Change leave" icon={CalendarMinus} ariaLabel={`Change ${l.dentistName}'s leave for ${shortRange(l.startDate, l.endDate)}`}
                  onClick={() => setChanging(l)} />
              ) : <Spacer />}
            </RowActions>
          )}
          dayOffActions={(d) => (
            <RowActions>
              <IconAction label="Delete day off" icon={Trash2} ariaLabel={`Delete day off ${shortRange(d.date, d.date)}`}
                className="text-destructive hover:text-destructive" onClick={() => onRemoveDayOff(d.id)} />
              <Spacer />
            </RowActions>
          )} />
      </CardContent>
      <LeaveDetails leave={viewing} who="superadmin" onClose={() => setViewing(null)} />
      <ChangeLeave leave={changing} direct onClose={() => setChanging(null)} />
    </Card>
  );
}

/**
 * The superadmin's Approve and Reject for one leave waiting on them: a new request, or a
 * change asked to approved leave. A request can't be approved while bookings hold its days;
 * rejecting needs a reason, which the person sees.
 */
export function DecideLeave({ l }: { l: LeaveRequest }) {
  const change = !!pendingChange(l);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const who = `${l.dentistName}'s leave for ${shortRange(l.startDate, l.endDate)}`;

  const run = async (act: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await act();
      toast.success(done);
      setRejecting(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the decision");
    } finally {
      setBusy(false);
    }
  };
  const approve = () => change
    ? run(() => approveLeaveChange(l.id), "Change approved. Those days and hours are open for bookings again.")
    : run(() => approveLeave(l.id), "Leave approved. Those days are now Unavailable Dates.");
  const reject = () => change
    ? run(() => rejectLeaveChange(l.id, why.trim()), "Change rejected. The leave stays as it was.")
    : run(() => rejectLeave(l.id, why.trim()), "Leave rejected");
  const blocked = !change && l.conflicts.length > 0;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="text-destructive" disabled={busy}
          aria-label={`${change ? "Reject change to" : "Reject"} ${who}`} onClick={() => { setWhy(""); setRejecting(true); }}>
          <X className="w-4 h-4 mr-1" /> Reject
        </Button>
        <Hint label={blocked ? "Move the bookings first" : undefined}>
          <span tabIndex={blocked ? 0 : undefined}>
            <Button size="sm" disabled={busy || blocked} aria-label={`${change ? "Approve change to" : "Approve"} ${who}`} onClick={approve}>
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Approve
            </Button>
          </span>
        </Hint>
      </div>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">{change ? "Reject Change" : "Reject Leave"}</DialogTitle>
            <DialogDescription>
              {l.dentistName}: {describeDates(l)} ({l.reason}){change ? `. Asks to ${describeChange(l.changeRequest!)}.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-why-${l.id}`}>Reason *</Label>
            <Textarea id={`reject-why-${l.id}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="They will see this" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>Back</Button>
            <Button variant="destructive" disabled={!why.trim() || busy} onClick={reject}>{change ? "Reject Change" : "Reject Leave"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
