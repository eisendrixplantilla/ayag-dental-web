import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL, PIN_COL, CODE_COL } from "@/lib/tableClass";
import CollapsedEmail from "@/components/CollapsedEmail";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Archive, Edit, Eye, Loader2, CalendarClock, Printer } from "lucide-react";
import { toast } from "sonner";
import { getStaff, updateStaff, archiveStaff, type StaffMember } from "@/lib/api/staff";
import { getLeave } from "@/lib/api/leave";
import { formatManilaDate } from "@/lib/formatDate";
import { useAuth } from "@/contexts/AuthContext";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import SortableHead from "@/components/SortableHead";
import { useTableSort } from "@/hooks/useTableSort";
import MobileInput from "@/components/MobileInput";
import { PasswordLengthCheck } from "@/components/PasswordChecks";
import { cleanName, formatMobile, formatName, PH_MOBILE } from "@/lib/inputRules";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, matchesReportFilter } from "@/lib/reportFilter";
import { IconAction, MoreActions, RowActions } from "@/components/RowActions";

const COLUMNS = ["Employee ID", "Full Name", "Email Address", "Contact Number", "Role", "Account Status"];

const roleLabel = (r: string) => (r === "dentist" ? "Dentist" : "Admin");

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

  const load = () => {
    setLoading(true);
    getStaff()
      .then(setStaff)
      .catch(() => toast.error("Failed to load staff accounts"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  // Dentists waiting on a leave decision, so the superadmin sees whose schedule to open.
  const [onLeaveRequest, setOnLeaveRequest] = useState<Set<string>>(new Set());
  useEffect(() => {
    getLeave()
      .then((l) => setOnLeaveRequest(new Set((Array.isArray(l) ? l : []).filter((x) => x.status === "pending").map((x) => x.dentistId))))
      .catch(() => {});
  }, []);

  const rows = useMemo(
    () => staff.map(s => [
      s.employeeId ?? "—", s.name, s.email, s.contact ?? "—", roleLabel(s.role), s.status,
    ]),
    [staff],
  );
  const matched = useMemo(
    () => staff.map((member, i) => ({ member, row: rows[i] })).filter(({ row }) => matchesReportFilter(row, filter)),
    [staff, rows, filter],
  );
  const { sorted: shown, sortKey, headProps } = useTableSort(matched, s => s.row);
  const filtered = shown.map(s => s.member);
  const { page, setPage, paged } = usePagination(filtered, [filter, sortKey]);

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
    setEditForm({ name: s.name, email: s.email, contact: formatMobile(s.contact ?? ""), password: "", status: s.status });
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!cleanName(editForm.name) || !editForm.email.trim() || !editForm.contact.trim()) {
      toast.error("Full name, email, and contact number are required");
      return;
    }
    if (!PH_MOBILE.test(editForm.contact)) {
      toast.error("Enter an 11-digit mobile number starting with 09");
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setSaving(true);
    try {
      await updateStaff(editing.id, {
        name: cleanName(editForm.name),
        email: editForm.email.trim(),
        contact: editForm.contact,
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
                <SortableHead className={CODE_COL} {...headProps(0)}>Employee ID</SortableHead>
                <SortableHead {...headProps(1)} className={PIN_COL}>Full Name</SortableHead>
                <SortableHead {...headProps(2)}>Email Address</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(3)}>Contact Number</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(4)}>Role</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(5)}>Account Status</SortableHead>
                <TableHead className={`print:hidden ${CODE_COL}`}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">No staff accounts found</TableCell>
                </TableRow>
              ) : paged.map(s => (
                <TableRow key={s.id}>
                  <TableCell className={`font-mono text-sm ${CODE_COL}`}>{s.employeeId ?? "—"}</TableCell>
                  <TableCell className={`font-medium ${WRAP_CELL} ${PIN_COL}`}>
                    {s.name}
                    {onLeaveRequest.has(s.id) && (
                      <button
                        type="button"
                        onClick={() => navigate(`/superadmin/staff/${s.employeeId ?? s.id}/schedule`, { state: { id: s.id } })}
                        className="ml-2 inline-flex print:hidden"
                        aria-label={`Open ${s.name}'s leave request`}
                      >
                        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 whitespace-nowrap">Leave request</Badge>
                      </button>
                    )}
                  </TableCell>
                  <TableCell><CollapsedEmail email={s.email} /></TableCell>
                  <TableCell className={CODE_COL}>{s.contact ?? "—"}</TableCell>
                  <TableCell className={CODE_COL}><Badge variant="outline" className="bg-secondary text-secondary-foreground">{roleLabel(s.role)}</Badge></TableCell>
                  <TableCell className={CODE_COL}>
                    <Badge variant="outline" className={s.status === "active" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={`print:hidden ${CODE_COL}`}>
                    <RowActions>
                      <IconAction label="View" icon={Eye} onClick={() => setViewing(s)} />
                      <MoreActions actions={[
                        { label: "Edit", icon: Edit, onClick: () => openEdit(s) },
                        { label: "Schedule", icon: CalendarClock, onClick: () => navigate(`/superadmin/staff/${s.employeeId ?? s.id}/schedule`, { state: { id: s.id } }) },
                        { label: "Archive", icon: Archive, onClick: () => openArchive(s), danger: true },
                      ]} />
                    </RowActions>
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
              <div><Label>Full Name</Label><Input autoCapitalize="words" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: formatName(e.target.value) }))} onBlur={() => setEditForm(f => ({ ...f, name: cleanName(f.name) }))} /></div>
              <div><Label>Contact Number</Label><MobileInput value={editForm.contact} onValueChange={v => setEditForm(f => ({ ...f, contact: v }))} /></div>
              <div><Label>Email Address</Label><Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Password</Label><PasswordInput autoComplete="new-password" placeholder="Leave blank to keep current" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} />{editForm.password && <PasswordLengthCheck password={editForm.password} minLength={6} />}</div>
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
