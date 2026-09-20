import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Archive, Edit, Search, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getStaff, updateStaff, archiveStaff, type StaffMember } from "@/lib/api/staff";

const roleLabel = (r: string) => (r === "dentist" ? "Dentist" : "Admin");

export default function SuperAdminStaff() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const [viewing, setViewing] = useState<StaffMember | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", contact: "", password: "", status: "active" });
  const [archiving, setArchiving] = useState<StaffMember | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getStaff()
      .then(setStaff)
      .catch(() => toast.error("Failed to load staff accounts"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = staff.filter(s => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q || (s.employeeId ?? "").toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    const matchesRole = roleFilter === "all" || s.role === roleFilter;
    return matchesSearch && matchesRole;
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

  const confirmArchive = async () => {
    if (!archiving) return;
    setSaving(true);
    try {
      await archiveStaff(archiving.id);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Staff Management</h1>
          <p className="text-muted-foreground">Manage Admin and Dentist accounts</p>
        </div>
        <Button className="gradient-primary text-primary-foreground" onClick={() => navigate("/superadmin/staff/new")}>
          <Plus className="w-4 h-4 mr-2" />Add Staff
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
            <div className="relative min-w-[200px] max-w-sm flex-1">
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
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
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
                  <TableCell className="font-mono text-sm">{s.employeeId ?? "—"}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{s.contact ?? "—"}</TableCell>
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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-warning" title="Archive" onClick={() => setArchiving(s)}>
                        <Archive className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
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
              {archiving?.name} will be moved to the Archive with status "Archived". The account can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>Cancel</Button>
            <Button
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={confirmArchive}
              disabled={saving}
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
