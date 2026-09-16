import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Archive, Edit, Search, Eye, CalendarClock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveStaff, archiveStaff, updateStaff, type Staff } from "@/lib/staffStore";
import {
  useDentistSchedules,
  saveDentistSchedule,
  addUnavailableDate,
  removeUnavailableDate,
  generateSlots,
  toLabel,
  toMinutes,
  type UnavailableType,
} from "@/lib/dentistSchedules";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEAVE_TYPES: UnavailableType[] = ["Vacation Leave", "Sick Leave", "Holiday", "Emergency Leave"];
const roleLabel = (r: string) => (r === "dentist" ? "Dentist" : "Admin");

export default function SuperAdminStaff() {
  const navigate = useNavigate();
  const staff = useActiveStaff();
  const schedules = useDentistSchedules();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [viewing, setViewing] = useState<Staff | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", contact: "", username: "", password: "", status: "active" });
  const [archiving, setArchiving] = useState<Staff | null>(null);
  const [scheduleFor, setScheduleFor] = useState<Staff | null>(null);
  const [cfg, setCfg] = useState({
    workingDays: [1, 2, 3, 4, 5] as number[],
    start: "09:00",
    end: "17:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    duration: 30,
    maxPatientsPerDay: 10,
  });
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState<UnavailableType>("Vacation Leave");

  const filtered = staff.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q || s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || s.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const scheduleOf = (s: Staff | null) => (s ? schedules.find(x => x.name === s.name) : undefined);
  const currentSchedule = scheduleOf(scheduleFor);

  const previewSlots = useMemo(() => {
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      if (!cfg.workingDays.includes(d.getDay())) continue;
      const slots = generateSlots(
        {
          name: scheduleFor?.name ?? "",
          ...cfg,
          leave: currentSchedule?.leave ?? [],
          unavailable: currentSchedule?.unavailable ?? [],
          booked: {},
        },
        d,
      );
      if (slots.length) return { date: d, slots };
    }
    return null;
  }, [cfg, currentSchedule, scheduleFor]);

  const openEdit = (s: Staff) => {
    setEditing(s);
    setEditForm({ name: s.name, email: s.email, contact: s.contact, username: s.username, password: "", status: s.status });
  };

  const saveEdit = () => {
    if (!editing) return;
    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.contact.trim() || !editForm.username.trim()) {
      toast.error("Full name, email, contact number, and username are required");
      return;
    }
    updateStaff(editing.id, {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      contact: editForm.contact.trim(),
      username: editForm.username.trim(),
      status: editForm.status,
    });
    toast.success("Staff account updated");
    setEditing(null);
  };

  const openSchedule = (s: Staff) => {
    setScheduleFor(s);
    const sch = schedules.find(x => x.name === s.name);
    setCfg({
      workingDays: sch?.workingDays ?? [1, 2, 3, 4, 5],
      start: sch?.start ?? "09:00",
      end: sch?.end ?? "17:00",
      lunchStart: sch?.lunchStart ?? "12:00",
      lunchEnd: sch?.lunchEnd ?? "13:00",
      duration: sch?.duration ?? 30,
      maxPatientsPerDay: sch?.maxPatientsPerDay ?? 10,
    });
  };

  const saveSchedule = () => {
    if (!scheduleFor) return;
    if (cfg.workingDays.length === 0) return toast.error("Select at least one working day");
    if (toMinutes(cfg.end) <= toMinutes(cfg.start)) return toast.error("Working hours end must be after the start time");
    if (cfg.duration < 10) return toast.error("Appointment duration must be at least 10 minutes");
    if (cfg.maxPatientsPerDay < 1) return toast.error("Maximum patients per day must be at least 1");
    saveDentistSchedule(scheduleFor.name, cfg);
    toast.success("Schedule saved — appointment slots regenerated system-wide");
    setScheduleFor(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Staff Management</h1>
          <p className="text-muted-foreground">Manage Admin and Dentist accounts and dentist schedules</p>
        </div>
        <Button className="gradient-primary text-primary-foreground" onClick={() => navigate("/superadmin/staff/new")}>
          <Plus className="w-4 h-4 mr-2" />Add Staff
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by Employee ID, name, or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="dentist">Dentist</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee ID</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Contact Number</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No staff accounts found</TableCell>
                </TableRow>
              ) : filtered.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm">{s.id}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{s.contact}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-secondary text-secondary-foreground">{roleLabel(s.role)}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={s.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-warning" title="Archive" onClick={() => setArchiving(s)}>
                        <Archive className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View staff */}
      <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="max-w-lg bg-background">
          <DialogHeader><DialogTitle className="font-heading">Staff Details</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <Row label="Employee ID" value={viewing.id} />
              <Row label="Full Name" value={viewing.name} />
              <Row label="Email Address" value={viewing.email} />
              <Row label="Contact Number" value={viewing.contact} />
              <Row label="Role" value={roleLabel(viewing.role)} />
              <Row label="Account Status" value={viewing.status} />
              {viewing.role === "dentist" && (
                <div className="pt-3 border-t">
                  <p className="font-medium mb-2">Current Working Schedule</p>
                  {(() => {
                    const sch = scheduleOf(viewing);
                    if (!sch) return <p className="text-muted-foreground">No schedule configured yet.</p>;
                    return (
                      <div className="space-y-2">
                        <Row label="Working Days" value={sch.workingDays.map(d => DAYS[d]).join(", ")} />
                        <Row label="Working Hours" value={`${toLabel(toMinutes(sch.start))} - ${toLabel(toMinutes(sch.end))}`} />
                        <Row label="Lunch Break" value={`${toLabel(toMinutes(sch.lunchStart))} - ${toLabel(toMinutes(sch.lunchEnd))}`} />
                        <Row label="Appointment Duration" value={`${sch.duration} minutes`} />
                        <Row label="Max Patients / Day" value={String(sch.maxPatientsPerDay)} />
                        <Row
                          label="Unavailable Dates"
                          value={(sch.unavailable ?? []).length ? (sch.unavailable ?? []).map(u => `${u.date} (${u.type})`).join(", ") : "None"}
                        />
                      </div>
                    );
                  })()}
                </div>
              )}
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
                <Input value={editing.id} readOnly disabled className="font-mono" />
              </div>
              <div><Label>Full Name</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Contact Number</Label><Input value={editForm.contact} onChange={e => setEditForm(f => ({ ...f, contact: e.target.value }))} /></div>
              <div><Label>Email Address</Label><Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Username</Label><Input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))} /></div>
              <div><Label>Password</Label><Input type="password" placeholder="Leave blank to keep current" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} /></div>
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
            <Button className="gradient-primary text-primary-foreground" onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <Dialog open={!!archiving} onOpenChange={o => !o && setArchiving(null)}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Archive Staff Account</DialogTitle>
            <DialogDescription>
              {archiving?.name} will be moved to the Archive with status "Archived". The account can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>Cancel</Button>
            <Button
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => {
                if (archiving) archiveStaff(archiving.id);
                toast.success("Staff account archived");
                setArchiving(null);
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dentist schedule configuration */}
      <Dialog open={!!scheduleFor} onOpenChange={o => !o && setScheduleFor(null)}>
        <DialogContent className="max-w-2xl bg-background max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Dentist Schedule Configuration</DialogTitle>
            <DialogDescription>{scheduleFor?.name} — appointment slots are generated automatically from this setup.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <Label className="mb-2 block">Working Days</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={cfg.workingDays.includes(i)}
                      onCheckedChange={checked =>
                        setCfg(c => ({
                          ...c,
                          workingDays: checked ? [...c.workingDays, i].sort() : c.workingDays.filter(x => x !== i),
                        }))
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Working Hours Start</Label><Input type="time" value={cfg.start} onChange={e => setCfg(c => ({ ...c, start: e.target.value }))} /></div>
              <div><Label>Working Hours End</Label><Input type="time" value={cfg.end} onChange={e => setCfg(c => ({ ...c, end: e.target.value }))} /></div>
              <div><Label>Lunch Break Start</Label><Input type="time" value={cfg.lunchStart} onChange={e => setCfg(c => ({ ...c, lunchStart: e.target.value }))} /></div>
              <div><Label>Lunch Break End</Label><Input type="time" value={cfg.lunchEnd} onChange={e => setCfg(c => ({ ...c, lunchEnd: e.target.value }))} /></div>
              <div><Label>Appointment Duration (minutes)</Label><Input type="number" min={10} step={5} value={cfg.duration} onChange={e => setCfg(c => ({ ...c, duration: Number(e.target.value) }))} /></div>
              <div><Label>Maximum Patients Per Day</Label><Input type="number" min={1} value={cfg.maxPatientsPerDay} onChange={e => setCfg(c => ({ ...c, maxPatientsPerDay: Number(e.target.value) }))} /></div>
            </div>

            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-sm font-medium mb-2">Automatically generated slots (preview)</p>
              {previewSlots ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Next working day: {previewSlots.date.toDateString()} — {previewSlots.slots.length} slots
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {previewSlots.slots.map(s => (
                      <Badge key={s.value} variant="outline" className="bg-background">{s.label}</Badge>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No slots can be generated with the current setup.</p>
              )}
            </div>

            <div>
              <Label className="mb-2 block">Unavailable Dates</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input type="date" value={leaveDate} onChange={e => setLeaveDate(e.target.value)} className="sm:w-48" />
                <Select value={leaveType} onValueChange={v => setLeaveType(v as UnavailableType)}>
                  <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!scheduleFor) return;
                    if (!leaveDate) return toast.error("Select a date first");
                    addUnavailableDate(scheduleFor.name, { date: leaveDate, type: leaveType });
                    setLeaveDate("");
                    toast.success("Unavailable date added — dentist is now excluded from booking that day");
                  }}
                >
                  Add Date
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {(currentSchedule?.unavailable ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unavailable dates.</p>
                ) : (currentSchedule?.unavailable ?? []).map(u => (
                  <div key={u.date} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span>{u.date} <Badge variant="outline" className="ml-2 bg-secondary text-secondary-foreground">{u.type}</Badge></span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => scheduleFor && removeUnavailableDate(scheduleFor.name, u.date)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleFor(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={saveSchedule}>Save Schedule</Button>
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
