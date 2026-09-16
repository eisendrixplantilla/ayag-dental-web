import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, CheckCircle, XCircle, Eye, Search, Mail } from "lucide-react";
import { toast } from "sonner";

type Status = "pending" | "confirmed" | "rejected";

interface Appointment {
  id: string;
  patient: string;
  email: string;
  phone: string;
  service: string;
  dentist: string;
  date: string;
  time: string;
  type: "Online" | "Walk-in";
  status: Status;
  reason?: string;
}

const initialAppointments: Appointment[] = [
  { id: "AP001", patient: "Juan Dela Cruz", email: "juan.delacruz@email.com", phone: "09171234567", service: "Teeth Whitening", dentist: "Dr. Ayag", date: "2024-03-20", time: "10:00 AM", type: "Online", status: "pending" },
  { id: "AP002", patient: "Maria Santos", email: "maria.santos@email.com", phone: "09181234567", service: "Root Canal", dentist: "Dr. Santos", date: "2024-03-21", time: "2:00 PM", type: "Online", status: "pending" },
  { id: "AP003", patient: "Pedro Reyes", email: "pedro.reyes@email.com", phone: "09191234567", service: "Orthodontics (Braces)", dentist: "Dr. Reyes", date: "2024-03-22", time: "9:00 AM", type: "Walk-in", status: "confirmed" },
  { id: "AP004", patient: "Ana Garcia", email: "ana.garcia@email.com", phone: "09201234567", service: "EXO (Bunot)", dentist: "Dr. Cruz", date: "2024-03-19", time: "3:30 PM", type: "Online", status: "rejected", reason: "Dentist unavailable on the selected date." },
  { id: "AP005", patient: "Liza Manalo", email: "liza.manalo@email.com", phone: "09211234567", service: "Oral Prophylaxis", dentist: "Dr. Ayag", date: "2024-03-23", time: "11:00 AM", type: "Walk-in", status: "pending" },
];

const statusColors: Record<Status, string> = {
  pending: "bg-warning/10 text-warning border-warning/20",
  confirmed: "bg-success/10 text-success border-success/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function AdminOnlineAppointments() {
  const [appointments, setAppointments] = useState<Appointment[]>(initialAppointments);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dentistFilter, setDentistFilter] = useState("all");

  const dentists = useMemo(
    () => Array.from(new Set(appointments.map(a => a.dentist))).sort(),
    [appointments]
  );

  const filtered = useMemo(() => appointments.filter(a => {
    const matchesSearch = !search || a.patient.toLowerCase().includes(search.toLowerCase()) || a.id.toLowerCase().includes(search.toLowerCase());
    const matchesDate = !dateFilter || a.date === dateFilter;
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const matchesDentist = dentistFilter === "all" || a.dentist === dentistFilter;
    return matchesSearch && matchesDate && matchesStatus && matchesDentist;
  }), [appointments, search, dateFilter, statusFilter, dentistFilter]);

  const selectedLive = selected ? appointments.find(a => a.id === selected.id) ?? null : null;


  const clearFilters = () => {
    setSearch(""); setDateFilter(""); setStatusFilter("all"); setDentistFilter("all");
  };

  const handleApprove = (apt: Appointment) => {
    setAppointments(prev => prev.map(a => a.id === apt.id ? { ...a, status: "confirmed" } : a));
    toast.success(`Appointment ${apt.id} confirmed`, {
      description: `Confirmation email sent to ${apt.email}`,
    });
  };

  const openReject = (apt: Appointment) => {
    setSelected(apt);
    setReason("");
    setRejectOpen(true);
  };

  const handleReject = () => {
    if (!selected || !reason.trim()) return;
    setAppointments(prev => prev.map(a => a.id === selected.id ? { ...a, status: "rejected", reason: reason.trim() } : a));
    toast.success(`Appointment ${selected.id} rejected`, {
      description: `Rejection email sent to ${selected.email} with the reason provided.`,
    });
    setRejectOpen(false);
    setSelected(null);
    setReason("");
  };

  const openDetails = (apt: Appointment) => {
    setSelected(apt);
    setDetailsOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Appointments</h1>
        <p className="text-muted-foreground">Review, approve, and manage patient appointments</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
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
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(apt => (
                <TableRow key={apt.id}>
                  <TableCell className="font-mono text-xs">{apt.id}</TableCell>
                  <TableCell className="font-medium">{apt.patient}</TableCell>
                  <TableCell>{apt.service}</TableCell>
                  <TableCell>{apt.dentist}</TableCell>
                  <TableCell>{apt.date}</TableCell>
                  <TableCell>{apt.time}</TableCell>
                  <TableCell><Badge variant="secondary">{apt.type}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className={statusColors[apt.status]}>{apt.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openDetails(apt)}>
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                      {apt.status === "pending" && (
                        <>
                          <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => handleApprove(apt)}>
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
              <p><span className="font-semibold text-foreground">Patient Name:</span> {selectedLive.patient}</p>
              <p><span className="font-semibold text-foreground">Contact Number:</span> {selectedLive.phone}</p>
              <p><span className="font-semibold text-foreground">Email Address:</span> {selectedLive.email}</p>
              <p><span className="font-semibold text-foreground">Selected Service:</span> {selectedLive.service}</p>
              <p><span className="font-semibold text-foreground">Assigned Dentist:</span> {selectedLive.dentist}</p>
              <p><span className="font-semibold text-foreground">Appointment Date:</span> {selectedLive.date}</p>
              <p><span className="font-semibold text-foreground">Appointment Time:</span> {selectedLive.time}</p>
              <p><span className="font-semibold text-foreground">Appointment Type:</span> {selectedLive.type}</p>
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
            <Button variant="destructive" onClick={handleReject} disabled={!reason.trim()}>
              <Mail className="w-4 h-4 mr-1" /> Reject & Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
