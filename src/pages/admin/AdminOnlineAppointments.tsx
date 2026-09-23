import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getAppointments, confirmAppointment, rejectAppointment, describeEmailOutcome, type Appointment, type AptStatus } from "@/lib/api/appointments";
import { formatManilaDate, formatManilaStamp } from "@/lib/formatDate";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { useNotificationJump, HIGHLIGHT_ROW_CLASS } from "@/hooks/useNotificationJump";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  confirmed: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-primary/10 text-primary border-primary/20",
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
  const [serviceFilter, setServiceFilter] = useState("all");

  // `silent` is for background refreshes: no spinner over the table and no error
  // toast, so polling is invisible unless something actually changed.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    getAppointments()
      .then(setAppointments)
      .catch(() => { if (!silent) toast.error("Failed to load appointments"); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => load(), []);
  // Pick up changes made by other people without needing a manual page refresh.
  useAutoRefresh(() => load(true));

  const dentists = useMemo(
    () => Array.from(new Set(appointments.map(a => a.dentistName).filter(Boolean))).sort() as string[],
    [appointments]
  );

  // The services offered change over time, so list the ones actually booked
  // rather than a hard-coded menu.
  const services = useMemo(
    () => Array.from(new Set(appointments.map(a => a.service).filter(Boolean))).sort() as string[],
    [appointments]
  );

  // Newest bookings first, so a request that just came in is at the top of the list.
  const ordered = useMemo(
    () => [...appointments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [appointments]
  );

  const filtered = useMemo(() => ordered.filter(a => {
    const matchesSearch = !search || a.patientName.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase());
    const matchesDate = !dateFilter || a.date === dateFilter;
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const matchesDentist = dentistFilter === "all" || a.dentistName === dentistFilter;
    const matchesService = serviceFilter === "all" || a.service === serviceFilter;
    return matchesSearch && matchesDate && matchesStatus && matchesDentist && matchesService;
  }), [ordered, search, dateFilter, statusFilter, dentistFilter, serviceFilter]);

  const selectedLive = selected ? appointments.find(a => a.id === selected.id) ?? null : null;

  const clearFilters = () => {
    setSearch(""); setDateFilter(""); setStatusFilter("all"); setDentistFilter("all"); setServiceFilter("all");
  };

  // Arrived here from a notification — drop any active filter first, otherwise the
  // row being jumped to might not be on screen at all.
  const { highlightedKey, registerRow } = useNotificationJump(
    useCallback((id: string) => appointments.find(a => a.id === id)?.id, [appointments]),
    clearFilters,
  );

  const handleApprove = async (apt: Appointment) => {
    setSaving(true);
    try {
      const result = await confirmAppointment(apt.id);
      const email = describeEmailOutcome(result, "Confirmation");
      (email.ok ? toast.success : toast.warning)("Appointment approved", { description: email.text });
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
      const result = await rejectAppointment(selected.id, reason.trim());
      const email = describeEmailOutcome(result, "Rejection");
      (email.ok ? toast.success : toast.warning)("Appointment rejected", { description: email.text });
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

      <Card className="shadow-card">
        <CardHeader className="space-y-4">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" /> Appointments ({filtered.length})
          </CardTitle>
          <div className="space-y-3 print:hidden">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="relative sm:col-span-2 lg:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search patient name or ID..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Input type="date" aria-label="Filter by date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filter by status"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dentistFilter} onValueChange={setDentistFilter}>
                <SelectTrigger aria-label="Filter by dentist"><SelectValue placeholder="Dentist" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dentists</SelectItem>
                  {dentists.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger aria-label="Filter by service"><SelectValue placeholder="Service" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {services.map(sv => <SelectItem key={sv} value={sv}>{sv}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden lg:table-cell">Appointment ID</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead className="hidden sm:table-cell">Service</TableHead>
                <TableHead className="hidden md:table-cell">Assigned Dentist</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="hidden lg:table-cell">Booked On</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(apt => (
                <TableRow
                  key={apt.id}
                  ref={registerRow(apt.id)}
                  className={highlightedKey === apt.id ? HIGHLIGHT_ROW_CLASS : undefined}
                >
                  <TableCell className="hidden lg:table-cell font-mono text-xs">{apt.id.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{apt.patientName}</TableCell>
                  <TableCell className="hidden sm:table-cell">{apt.service}</TableCell>
                  <TableCell className="hidden md:table-cell">{apt.dentistName}</TableCell>
                  <TableCell className="whitespace-nowrap">{apt.date}</TableCell>
                  <TableCell className="whitespace-nowrap">{toLabel(toMinutes(apt.time))}</TableCell>
                  <TableCell className="hidden lg:table-cell whitespace-nowrap text-xs text-muted-foreground">{formatManilaStamp(apt.createdAt)}</TableCell>
                  <TableCell className="hidden md:table-cell"><Badge variant="secondary">{apt.type === "walk-in" ? "Walk-in" : "Online"}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge></TableCell>
                  <TableCell className="print:hidden text-right">
                    {/* One way in: everything about an appointment, including approving or
                        rejecting it, lives behind View. */}
                    <Button size="sm" variant="outline" className="hidden lg:inline-flex" onClick={() => openDetails(apt)}>
                      <Eye className="w-4 h-4 mr-1" /> View
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 lg:hidden" aria-label="View details" title="View details" onClick={() => openDetails(apt)}>
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No appointments found</TableCell></TableRow>
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
              <p><span className="font-semibold text-foreground">Booked On:</span> {formatManilaStamp(selectedLive.createdAt)}</p>
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
                <Button className="gradient-primary text-primary-foreground" disabled={saving} onClick={() => handleApprove(selectedLive)}>
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
