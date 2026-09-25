import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL } from "@/lib/tableClass";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Archive, Edit, Eye, Loader2, CalendarClock, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  getStaff, updateStaff, archiveStaff, type StaffMember,
  getDentistSchedule, saveDentistScheduleDays, addDentistUnavailable, removeDentistUnavailable,
  generateAvailableSlots, DAY_NAMES, type ScheduleDay, type UnavailableDate,
} from "@/lib/api/staff";
import { formatManilaDate } from "@/lib/formatDate";
import { useAuth } from "@/contexts/AuthContext";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, matchesReportFilter } from "@/lib/reportFilter";

const COLUMNS = ["Employee ID", "Full Name", "Email Address", "Contact Number", "Role", "Account Status"];

const roleLabel = (r: string) => (r === "dentist" ? "Dentist" : "Admin");

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

export default function SuperAdminStaff() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState(EMPTY_FILTER);

  const [viewing, setViewing] = useState<StaffMember | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", contact: "", password: "", status: "active" });
  const [archiving, setArchiving] = useState<StaffMember | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [scheduleFor, setScheduleFor] = useState<StaffMember | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>(Array.from({ length: 7 }, emptyDayConfig));
  const [unavailableList, setUnavailableList] = useState<UnavailableDate[]>([]);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  const load = () => {
    setLoading(true);
    getStaff()
      .then(setStaff)
      .catch(() => toast.error("Failed to load staff accounts"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const rows = useMemo(
    () => staff.map(s => [
      s.employeeId ?? "—", s.name, s.email, s.contact ?? "—", roleLabel(s.role), s.status,
    ]),
    [staff],
  );
  const shown = useMemo(
    () => staff.map((member, i) => ({ member, row: rows[i] })).filter(({ row }) => matchesReportFilter(row, filter)),
    [staff, rows, filter],
  );
  const filtered = shown.map(s => s.member);
  const { page, setPage, paged } = usePagination(filtered, filter);

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Staff Accounts Report",
      columns: COLUMNS,
      rows: shown.map(s => s.row),
      filters: filterIsActive(filter)
        ? [{ label: "Filtered By", value: describeReportFilter(COLUMNS, filter) ?? "" }]
        : undefined,
    });

  const openEdit = (s: StaffMember) => {
    setEditing(s);
    setEditForm({ name: s.name, email: s.email, contact: s.contact ?? "", password: "", status: s.status });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.contact.trim()) {
      toast.error("Full name, email, and contact number are required");
      return;
    }
    setSaving(true);
    try {
      await updateStaff(editing.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim(),
        contact: editForm.contact.trim(),
        password: editForm.password.trim() || undefined,
        status: editForm.status,
      });
      toast.success("Staff account updated");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update staff account");
    } finally {
      setSaving(false);
    }
  };

  const openArchive = (s: StaffMember) => {
    setArchiveReason("");
    setArchiving(s);
  };

  const confirmArchive = async () => {
    if (!archiving) return;
    const reason = archiveReason.trim();
    if (!reason) {
      toast.error("Please give a reason for archiving this account");
      return;
    }
    setSaving(true);
    try {
      await archiveStaff(archiving.id, reason, user?.name);
      toast.success("Staff account archived");
      setArchiving(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive staff account");
    } finally {
      setSaving(false);
    }
  };

  const openSchedule = (s: StaffMember) => {
    setScheduleFor(s);
    setScheduleLoading(true);
    setLeaveDate("");
    setLeaveReason("");
    getDentistSchedule(s.id)
      .then((data) => {
        const configs = Array.from({ length: 7 }, emptyDayConfig);
        for (const d of data.days) {
          configs[d.dayOfWeek] = {
            enabled: true,
            start: d.start,
            end: d.end,
            lunchStart: d.lunchStart ?? "",
            lunchEnd: d.lunchEnd ?? "",
            duration: d.duration,
            maxPatients: d.maxPatients,
          };
        }
        setDayConfigs(configs);
        setUnavailableList(data.unavailable);
      })
      .catch(() => toast.error("Failed to load schedule"))
      .finally(() => setScheduleLoading(false));
  };

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
      if (d.getDay() === previewDay) {
        return generateAvailableSlots({ days, unavailable: [] }, d, []);
      }
    }
    return [];
  }, [dayConfigs, previewDay]);

  const saveSchedule = async () => {
    if (!scheduleFor) return;
    const enabledDays = dayConfigs
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.enabled);
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
    setSavingSchedule(true);
    try {
      await saveDentistScheduleDays(scheduleFor.id, days);
      toast.success("Schedule saved — appointment slots regenerated system-wide");
      setScheduleFor(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const addLeave = async () => {
    if (!scheduleFor) return;
    if (!leaveDate) return toast.error("Select a date first");
    try {
      const entry = await addDentistUnavailable(scheduleFor.id, { date: leaveDate, reason: leaveReason || undefined });
      setUnavailableList((list) => [...list, entry].sort((a, b) => a.date.localeCompare(b.date)));
      setLeaveDate("");
      toast.success("Unavailable date added — dentist is now excluded from booking that day");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add unavailable date");
    }
  };

  const removeLeave = async (id: string) => {
    try {
      await removeDentistUnavailable(id);
      setUnavailableList((list) => list.filter((u) => u.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove unavailable date");
    }
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Staff Management · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Staff Management</h1>
          <p className="text-muted-foreground">Manage Admin and Dentist accounts</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">

          <Button className="gradient-primary text-primary-foreground" onClick={() => navigate("/superadmin/staff/new")}>
            <Plus className="w-4 h-4 mr-2" />Add Staff
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="print:hidden">
          <TableToolbar
            columns={COLUMNS}
            rows={rows}
            filter={filter}
            onChange={setFilter}
            shown={filtered.length}
            noun="account(s)"
            actions={
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Contact Number</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No staff accounts found</TableCell>
                </TableRow>
              ) : paged.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.employeeId ?? "—"}</TableCell>
                  <TableCell className={`font-medium ${WRAP_CELL}`}>{s.name}</TableCell>
                  <TableCell className={WRAP_CELL}>{s.email}</TableCell>
                  <TableCell>{s.contact ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-secondary text-secondary-foreground">{roleLabel(s.role)}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={s.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="print:hidden">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={() => setViewing(s)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(s)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      {s.role === "dentist" && (
                        <Button variant="ghost" size="sm" className="h-8 text-primary" title="Schedule" onClick={() => openSchedule(s)}>
                          <CalendarClock className="w-4 h-4 mr-1" />Schedule
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-warning" title="Archive" onClick={() => openArchive(s)}>
                        <Archive className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        <TablePagination
          page={page}
          onPageChange={setPage}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          noun="staff member(s)"
        />
        </CardContent>
      </Card>

      {/* View staff */}
      <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="max-w-lg bg-background">
          <DialogHeader><DialogTitle className="font-heading">Staff Details</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <Row label="Employee ID" value={viewing.employeeId ?? "—"} />
              <Row label="Full Name" value={viewing.name} />
              <Row label="Email Address" value={viewing.email} />
              <Row label="Contact Number" value={viewing.contact ?? "—"} />
              <Row label="Role" value={roleLabel(viewing.role)} />
              <Row label="Account Status" value={viewing.status} />
              <Row label="Date Added" value={viewing.createdAt ?? "—"} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit staff */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent className="max-w-lg bg-background">
          <DialogHeader><DialogTitle className="font-heading">Edit Staff Account</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Employee ID</Label>
                <Input value={editing.employeeId ?? "—"} readOnly disabled className="font-mono" />
              </div>
              <div><Label>Full Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Contact Number</Label><Input value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))} /></div>
              <div><Label>Email Address</Label><Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Password</Label><PasswordInput placeholder="Leave blank to keep current" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} /></div>
              <div>
                <Label>Account Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={saveEdit} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={!!archiving} onOpenChange={o => !o && setArchiving(null)}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Archive Staff Account</DialogTitle>
            <DialogDescription>
              {archiving?.name} ({archiving && roleLabel(archiving.role)}) will be moved to the Archive with status
              "Archived". The account can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="archive-reason">Reason for archiving</Label>
            <Textarea
              id="archive-reason"
              rows={3}
              value={archiveReason}
              onChange={e => setArchiveReason(e.target.value)}
              placeholder="e.g. Resigned effective September 30, 2026."
            />
            <p className="text-xs text-muted-foreground">
              Required. The reason is kept with the account in the Archive.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>Cancel</Button>
            <Button
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={confirmArchive}
              disabled={saving || !archiveReason.trim()}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dentist schedule configuration */}
      <Dialog open={!!scheduleFor} onOpenChange={o => !o && setScheduleFor(null)}>
        <DialogContent className="max-w-3xl bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Dentist Schedule Configuration</DialogTitle>
            <DialogDescription>{scheduleFor?.name} — appointment slots are generated automatically from this setup.</DialogDescription>
          </DialogHeader>

          {scheduleLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <div className="space-y-5">
            <div className="overflow-x-auto">
              <Table className={COMPACT_TABLE}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Lunch Start</TableHead>
                    <TableHead>Lunch End</TableHead>
                    <TableHead>Duration (min)</TableHead>
                    <TableHead>Max/Day</TableHead>
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
                      <TableCell><Input type="time" className="w-28" disabled={!c.enabled} value={c.start} onChange={e => updateDay(i, { start: e.target.value })} /></TableCell>
                      <TableCell><Input type="time" className="w-28" disabled={!c.enabled} value={c.end} onChange={e => updateDay(i, { end: e.target.value })} /></TableCell>
                      <TableCell><Input type="time" className="w-28" disabled={!c.enabled} value={c.lunchStart} onChange={e => updateDay(i, { lunchStart: e.target.value })} /></TableCell>
                      <TableCell><Input type="time" className="w-28" disabled={!c.enabled} value={c.lunchEnd} onChange={e => updateDay(i, { lunchEnd: e.target.value })} /></TableCell>
                      <TableCell><Input type="number" min={10} step={5} className="w-20" disabled={!c.enabled} value={c.duration} onChange={e => updateDay(i, { duration: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" min={1} className="w-20" disabled={!c.enabled} value={c.maxPatients} onChange={e => updateDay(i, { maxPatients: Number(e.target.value) })} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-sm font-medium mb-2">Automatically generated slots (preview of {previewDay >= 0 ? DAY_NAMES[previewDay] : "—"})</p>
              {previewSlots.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {previewSlots.map(s => (
                    <Badge key={s.value} variant="outline" className="bg-background">{s.label}</Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No slots can be generated with the current setup.</p>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Unavailable Dates</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className="sm:w-48" />
                <Input value={leaveReason} onChange={e => setLeaveReason(e.target.value)} placeholder="Reason (optional)" className="sm:w-52" />
                <Button variant="outline" onClick={addLeave}>Add Date</Button>
              </div>
              <div className="mt-3 space-y-2">
                {unavailableList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unavailable dates.</p>
                ) : unavailableList.map(u => (
                  <div key={u.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{u.date}{u.reason ? <Badge variant="outline" className="ml-2 bg-secondary text-secondary-foreground">{u.reason}</Badge> : null}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLeave(u.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleFor(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={saveSchedule} disabled={savingSchedule || scheduleLoading}>
              {savingSchedule && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
