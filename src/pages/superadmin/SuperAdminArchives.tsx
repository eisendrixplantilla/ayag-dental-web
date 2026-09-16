import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArchiveRestore, Eye, Search } from "lucide-react";
import { toast } from "sonner";
import { useArchivedStaff, restoreStaff } from "@/lib/staffStore";
import { useArchivedPatientAccounts, restorePatientAccount } from "@/lib/accountStore";

type ArchiveRow = {
  id: string;
  name: string;
  type: "Staff" | "Patient";
  email: string;
  contact: string;
  role?: string;
  archivedAt: string;
  archivedBy: string;
};

export default function SuperAdminArchives() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "staff" | "patient">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [viewing, setViewing] = useState<ArchiveRow | null>(null);
  const [restoring, setRestoring] = useState<ArchiveRow | null>(null);

  const staff = useArchivedStaff();
  const patients = useArchivedPatientAccounts();

  const rows: ArchiveRow[] = [
    ...staff.map<ArchiveRow>(s => ({
      id: s.id,
      name: s.name,
      type: "Staff",
      email: s.email,
      contact: s.contact,
      role: s.role === "dentist" ? "Dentist" : "Admin",
      archivedAt: s.archivedAt ?? "—",
      archivedBy: s.archivedBy ?? "Super Admin",
    })),
    ...patients.map<ArchiveRow>(p => ({
      id: p.id,
      name: p.name,
      type: "Patient",
      email: p.email,
      contact: p.phone ?? "—",
      archivedAt: p.archivedAt ?? "—",
      archivedBy: p.archivedBy ?? "Super Admin",
    })),
  ];

  const q = search.toLowerCase();
  const filtered = rows.filter(r => {
    const matchesSearch =
      !q ||
      r.id.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q);
    const matchesType = type === "all" || (type === "staff" ? r.type === "Staff" : r.type === "Patient");
    const matchesFrom = !fromDate || r.archivedAt >= fromDate;
    const matchesTo = !toDate || r.archivedAt <= toDate;
    return matchesSearch && matchesType && matchesFrom && matchesTo;
  });

  const confirmRestore = () => {
    if (!restoring) return;
    if (restoring.type === "Staff") {
      restoreStaff(restoring.id);
      toast.success(`${restoring.name} has been restored to Staff Management.`);
    } else {
      restorePatientAccount(restoring.id);
      toast.success(`${restoring.name} has been restored to Patient Accounts.`);
    }
    setRestoring(null);
    setViewing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Archive</h1>
        <p className="text-muted-foreground">Archived staff and patient accounts — nothing is permanently deleted</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Account Type</Label>
              <Select value={type} onValueChange={v => setType(v as typeof type)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="staff">Staff Accounts</SelectItem>
                  <SelectItem value="patient">Patient Accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" />
              </div>
              {(fromDate || toDate) && (
                <Button variant="ghost" size="sm" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Account Type</TableHead>
                <TableHead>Date Archived</TableHead>
                <TableHead>Archived By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No archived accounts</TableCell>
                </TableRow>
              ) : filtered.map(r => (
                <TableRow key={`${r.type}-${r.id}`}>
                  <TableCell className="font-mono text-sm">{r.id}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-secondary text-secondary-foreground">{r.type}</Badge>
                  </TableCell>
                  <TableCell>{r.archivedAt}</TableCell>
                  <TableCell>{r.archivedBy}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewing(r)}>
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRestoring(r)}>
                        <ArchiveRestore className="w-4 h-4 mr-1" /> Restore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="w-auto max-w-[min(90vw,32rem)] max-h-[90vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle>Archived {viewing?.type} Account</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <Row label={viewing.type === "Staff" ? "Employee ID" : "Patient ID"} value={viewing.id} />
              <Row label="Full Name" value={viewing.name} />
              {viewing.type === "Staff" && <Row label="Role" value={viewing.role ?? "—"} />}
              <Row label="Email Address" value={viewing.email} />
              <Row label="Contact Number" value={viewing.contact} />
              <Row label="Date Archived" value={viewing.archivedAt} />
              <Row label="Archived By" value={viewing.archivedBy} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            {viewing && <Button onClick={() => setRestoring(viewing)}>Restore</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!restoring} onOpenChange={o => !o && setRestoring(null)}>
        <DialogContent className="w-auto max-w-[min(90vw,28rem)] bg-background">
          <DialogHeader>
            <DialogTitle>Restore account?</DialogTitle>
            <DialogDescription>
              {restoring &&
                `${restoring.name} will be returned to ${restoring.type === "Staff" ? "Staff Management" : "Patient Accounts"} and removed from the Archive.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRestoring(null)}>Cancel</Button>
            <Button onClick={confirmRestore}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
