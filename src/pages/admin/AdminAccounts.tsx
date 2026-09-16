import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye, CheckCircle2, Ban, Archive } from "lucide-react";
import { toast } from "sonner";
import {
  usePatientAccounts,
  setAccountStatus,
  archivePatientAccount,
  canDeleteAccount,
  type PatientAccount,
} from "@/lib/accountStore";

export default function AdminAccounts() {
  const accounts = usePatientAccounts();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<PatientAccount | null>(null);

  const filtered = accounts.filter(a => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase());
    const matchesFrom = !fromDate || a.created >= fromDate;
    const matchesTo = !toDate || a.created <= toDate;
    return matchesSearch && matchesFrom && matchesTo;
  });

  const selectedLive = selected ? accounts.find(a => a.id === selected.id) ?? selected : null;

  const activate = (a: PatientAccount) => {
    setAccountStatus(a.id, "active");
    toast.success(`${a.name}'s account has been activated.`);
  };

  const deactivate = (a: PatientAccount) => {
    setAccountStatus(a.id, "inactive");
    toast.success(`${a.name}'s account has been deactivated and can no longer log in.`);
  };

  const remove = (a: PatientAccount) => {
    if (!canDeleteAccount(a)) {
      toast.error("This account has existing appointments or dental records and cannot be archived.");
      return;
    }
    archivePatientAccount(a.id);
    toast.success(`${a.name}'s account has been moved to the Archive.`);
    setSelected(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Patient Accounts</h1>
        <p className="text-muted-foreground">Manage patient login accounts</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
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
                <TableHead>Patient Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead>Date Registered</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={a.status === "active" ? "default" : "secondary"}
                      className={a.status === "active" ? "bg-success/10 text-success border-success/20" : ""}
                    >
                      {a.status === "active" ? "Active" : "Deactivated"}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.created}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setSelected(a)}>
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      {a.status === "inactive" ? (
                        <Button variant="ghost" size="sm" className="text-success" onClick={() => activate(a)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" /> Activate
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deactivate(a)}>
                          <Ban className="w-4 h-4 mr-1" /> Deactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No patient accounts found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLive} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="w-auto max-w-[min(90vw,32rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Account Details</DialogTitle>
          </DialogHeader>
          {selectedLive && (
            <div className="space-y-3 text-sm">
              <Row label="Patient Name" value={selectedLive.name} />
              <Row label="Email Address" value={selectedLive.email} />
              <Row label="Contact Number" value={selectedLive.phone ?? "—"} />
              <Row label="Account Status" value={selectedLive.status === "active" ? "Active" : "Deactivated"} />
              <Row label="Date Registered" value={selectedLive.created} />
              <Row label="Last Login" value={selectedLive.lastLogin ?? "—"} />
              <Row label="Appointments" value={String(selectedLive.appointments)} />
              <Row label="Dental Records" value={String(selectedLive.dentalRecords)} />
              {!canDeleteAccount(selectedLive) && (
                <p className="text-xs text-muted-foreground border rounded-md p-2">
                  This account has existing appointments or dental records, so it cannot be archived. Deactivate it instead.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
            {selectedLive && (selectedLive.status === "active" ? (
              <Button variant="secondary" onClick={() => deactivate(selectedLive)}>Deactivate</Button>
            ) : (
              <Button onClick={() => activate(selectedLive)}>Activate</Button>
            ))}
            {selectedLive && (
              <Button
                variant="outline"
                disabled={!canDeleteAccount(selectedLive)}
                onClick={() => remove(selectedLive)}
              >
                <Archive className="w-4 h-4 mr-1" /> Archive
              </Button>
            )}
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
