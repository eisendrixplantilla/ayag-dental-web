import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, CheckCircle, XCircle, Eye, Search, Mail, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { getAppointments, confirmAppointment, rejectAppointment, type Appointment, type AptStatus } from "@/lib/api/appointments";
import { formatManilaDate } from "@/lib/formatDate";

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  confirmed: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function AdminOnlineAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dentistFilter, setDentistFilter] = useState("all");

  const load = () => {
    setLoading(true);
    getAppointments()
      .then(setAppointments)
      .catch(() => toast.error("Failed to load appointments"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const dentists = useMemo(
    () => Array.from(new Set(appointments.map(a => a.dentistName).filter(Boolean))).sort() as string[],
    [appointments]
  );

  const filtered = useMemo(() => appointments.filter(a => {
    const matchesSearch = !search || a.patientName.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase());
    const matchesDate = !dateFilter || a.date === dateFilter;
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const matchesDentist = dentistFilter === "all" || a.dentistName === dentistFilter;
    return matchesSearch && matchesDate && matchesStatus && matchesDentist;
  }), [appointments, search, dateFilter, statusFilter, dentistFilter]);

  const selectedLive = selected ? appointments.find(a => a.id === selected.id) ?? null : null;

  const clearFilters = () => {
    setSearch(""); setDateFilter(""); setStatusFilter("all"); setDentistFilter("all");
  };

  const handleApprove = async (apt: Appointment) => {
    setSaving(true);
    try {
      await confirmAppointment(apt.id);
      toast.success(`Appointment confirmed`, { description: `Confirmation email sent to ${apt.email}` });
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm appointment");
    } finally {
      setSaving(false);
    }
  };

  const openReject = (apt: Appointment) => {
    setSelected(apt);
    setReason("");
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!selected || !reason.trim()) return;
    setSaving(true);
    try {
      await rejectAppointment(selected.id, reason.trim());
      toast.success(`Appointment rejected`, { description: `Rejection email sent to ${selected.email} with the reason provided.` });
      setRejectOpen(false);
      setSelected(null);
      setReason("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reject appointment");
    } finally {
      setSaving(false);
    }
  };

  const openDetails = (apt: Appointment) => {
    setSelected(apt);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Appointments · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Appointments</h1>
          <p className="text-muted-foreground">Review, approve, and manage patient appointments</p>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card print:hidden">
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search patient name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dentistFilter} onValueChange={setDentistFilter}>
              <SelectTrigger><SelectValue placeholder="Dentist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dentists</SelectItem>
                {dentists.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" /> Appointments ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Appointment ID</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Assigned Dentist</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(apt => (
                <TableRow key={apt.id}>
                  <TableCell className="font-mono text-xs">{apt.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{apt.patientName}</TableCell>
                  <TableCell>{apt.service}</TableCell>
                  <TableCell>{apt.dentistName}</TableCell>
                  <TableCell>{apt.date}</TableCell>
                  <TableCell>{apt.time}</TableCell>
                  <TableCell><Badge variant="secondary">{apt.type === "walk-in" ? "Walk-in" : "Online"}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge></TableCell>
                  <TableCell className="print:hidden">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openDetails(apt)}>
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      {apt.status === "pending" && (
                        <>
                          <Button size="sm" className="gradient-primary text-primary-foreground" disabled={saving} onClick={() => handleApprove(apt)}>
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => openReject(apt)}>
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No appointments found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      {/* View Details */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-auto max-w-[min(90vw,36rem)] max-h-[90vh] overflow-y-auto sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Appointment Details</DialogTitle>
            <DialogDescription>Full information for this appointment.</DialogDescription>
          </DialogHeader>
          {selectedLive && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5 text-sm">
              <p><span className="font-semibold text-foreground">Appointment ID:</span> {selectedLive.id}</p>
              <p><span className="font-semibold text-foreground">Patient Name:</span> {selectedLive.patientName}</p>
              <p><span className="font-semibold text-foreground">Contact Number:</span> {selectedLive.contact}</p>
              <p><span className="font-semibold text-foreground">Email Address:</span> {selectedLive.email}</p>
              <p><span className="font-semibold text-foreground">Selected Service:</span> {selectedLive.service}</p>
              <p><span className="font-semibold text-foreground">Assigned Dentist:</span> {selectedLive.dentistName}</p>
              <p><span className="font-semibold text-foreground">Appointment Date:</span> {selectedLive.date}</p>
              <p><span className="font-semibold text-foreground">Appointment Time:</span> {selectedLive.time}</p>
              <p><span className="font-semibold text-foreground">Appointment Type:</span> {selectedLive.type === "walk-in" ? "Walk-in" : "Online"}</p>
              <p className="flex items-center gap-2"><span className="font-semibold text-foreground">Current Status:</span>
                <Badge variant="outline" className={statusColors[selectedLive.status]}>{selectedLive.status}</Badge>
              </p>
              {selectedLive.reason && <p><span className="font-semibold text-foreground">Rejection Reason:</span> {selectedLive.reason}</p>}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Close</Button>
            {selectedLive?.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => { setDetailsOpen(false); openReject(selectedLive); }}
                >
                  <XCircle className="w-4 h-4 mr-1" /> Reject Appointment
                </Button>
                <Button className="gradient-primary text-primary-foreground" onClick={() => handleApprove(selectedLive)}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Confirm Appointment
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject with reason */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" /> Reject Appointment
            </DialogTitle>
            <DialogDescription>
              A reason is required. It will be included in the rejection email sent to the patient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reason">Reason for rejection</Label>
            <Textarea id="reason" rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Dentist is unavailable on the selected date." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!reason.trim() || saving}>
              <Mail className="w-4 h-4 mr-1" /> Reject & Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
