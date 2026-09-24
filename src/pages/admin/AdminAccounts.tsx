import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Eye, CheckCircle2, Ban, Archive, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getPatients, getPatient, updatePatient, archivePatient, type Patient } from "@/lib/api/patients";
import { formatManilaDate, formatManilaDateTime } from "@/lib/formatDate";
import { usePrintDocument, printRange } from "@/hooks/usePrintDocument";

export default function AdminAccounts() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Patient | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getPatients()
      .then(setAccounts)
      .catch(() => toast.error("Failed to load patient accounts"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = accounts.filter(a => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase());
    const matchesFrom = !fromDate || (a.createdAt ?? "") >= fromDate;
    const matchesTo = !toDate || (a.createdAt ?? "") <= toDate;
    return matchesSearch && matchesFrom && matchesTo;
  });

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Patient Accounts Report",
      columns: ["Patient Name", "Email Address", "Account Status", "Date Registered"],
      rows: filtered.map(a => [
        a.name,
        a.email,
        a.status === "active" ? "Active" : "Deactivated",
        a.createdAt ?? "—",
      ]),
      filters: [
        { label: "Search", value: search.trim() || "None" },
        { label: "Date Registered", value: printRange(fromDate, toDate) },
      ],
    });

  const canArchive = (p: Patient) => (p.appointmentsCount ?? 0) === 0 && (p.dentalRecordsCount ?? 0) === 0;

  const openDetail = (a: Patient) => {
    setSelectedId(a.id);
    setDetail(null);
    setDetailLoading(true);
    getPatient(a.id)
      .then(setDetail)
      .catch(() => toast.error("Failed to load account details"))
      .finally(() => setDetailLoading(false));
  };

  const activate = async (a: Patient) => {
    try {
      await updatePatient(a.id, { status: "active" });
      toast.success(`${a.name}'s account has been activated.`);
      load();
      if (selectedId === a.id) openDetail(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to activate account");
    }
  };

  const deactivate = async (a: Patient) => {
    try {
      await updatePatient(a.id, { status: "inactive" });
      toast.success(`${a.name}'s account has been deactivated and can no longer log in.`);
      load();
      if (selectedId === a.id) openDetail(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate account");
    }
  };

  const remove = async (a: Patient) => {
    if (!canArchive(a)) {
      toast.error("This account has existing appointments or dental records and cannot be archived.");
      return;
    }
    try {
      await archivePatient(a.id, user?.name);
      toast.success(`${a.name}'s account has been moved to the Archive.`);
      setSelectedId(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to archive account");
    }
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Patient Accounts · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient Accounts</h1>
          <p className="text-muted-foreground">Manage patient login accounts</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader className="print:hidden">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
            <div className="relative min-w-[200px] flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="flex flex-wrap items-end gap-2">
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
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient Name</TableHead>
                <TableHead>Email Address</TableHead>
                <TableHead>Account Status</TableHead>
                <TableHead>Date Registered</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
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
                  <TableCell>{a.createdAt ?? "—"}</TableCell>
                  <TableCell className="print:hidden">
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDetail(a)}>
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
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="w-auto max-w-[min(90vw,32rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Account Details</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : detail && (
            <div className="space-y-3 text-sm">
              <Row label="Patient Name" value={detail.name} />
              <Row label="Email Address" value={detail.email} />
              <Row label="Contact Number" value={detail.phone ?? "—"} />
              <Row label="Account Status" value={detail.status === "active" ? "Active" : "Deactivated"} />
              <Row label="Date Registered" value={detail.createdAt ?? "—"} />
              <Row label="Last Login" value={detail.lastLogin ? formatManilaDateTime(detail.lastLogin) : "—"} />
              <Row label="Appointments" value={String(detail.appointmentsCount ?? 0)} />
              <Row label="Dental Records" value={String(detail.dentalRecordsCount ?? 0)} />
              {!canArchive(detail) && (
                <p className="text-xs text-muted-foreground border rounded-md p-2">
                  This account has existing appointments or dental records, so it cannot be archived. Deactivate it instead.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedId(null)}>Close</Button>
            {detail && (detail.status === "active" ? (
              <Button variant="secondary" onClick={() => deactivate(detail)}>Deactivate</Button>
            ) : (
              <Button onClick={() => activate(detail)}>Activate</Button>
            ))}
            {detail && (
              <Button
                variant="outline"
                disabled={!canArchive(detail)}
                onClick={() => remove(detail)}
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
