import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Eye, Edit, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { getPatients, createPatient, updatePatient, type Patient } from "@/lib/api/patients";
import { getAppointments, type Appointment } from "@/lib/api/appointments";
import { formatManilaDate } from "@/lib/formatDate";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, matchesReportFilter } from "@/lib/reportFilter";

const COLUMNS = ["Name", "Age", "Phone", "Email", "Status"];

// A walk-in booked for someone with no account has no patients row behind it, so it
// can only be shown read-only: there's nothing to open, edit or archive.
interface PatientRow {
  key: string;
  name: string;
  age: string;
  phone: string;
  email: string;
  patient: Patient | null;
  /** Has at least one walk-in visit — true for every guest, and for account holders booked at the desk. */
  hasWalkIn: boolean;
}

type RecordFilter = "all" | "account" | "no-account" | "walk-in";

// The categories overlap on purpose: an account holder booked at the desk is both
// "Has account" and "Walk-in", while every guest is both "No account" and "Walk-in".
const FILTERS: { value: RecordFilter; label: string; test: (r: PatientRow) => boolean }[] = [
  { value: "all", label: "All patients", test: () => true },
  { value: "account", label: "Has account", test: r => r.patient !== null },
  { value: "no-account", label: "No account", test: r => r.patient === null },
  { value: "walk-in", label: "Walk-in", test: r => r.hasWalkIn },
];

const patientSchema = z.object({
  name: z.string().trim().min(1, "Full name is required"),
  age: z.coerce.number().int().min(1, "Age is required").max(120, "Age must be valid"),
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email address"),
  address: z.string().trim().min(1, "Address is required"),
});

type FormState = { name: string; age: string; phone: string; email: string; address: string };
const emptyForm: FormState = { name: "", age: "", phone: "", email: "", address: "" };

export default function AdminPatients() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [showAdd, setShowAdd] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // `silent` is for background refreshes: no spinner, no error toast.
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([getPatients(), getAppointments()])
      .then(([p, a]) => { setPatients(p); setAppointments(a); })
      .catch(() => { if (!silent) toast.error("Failed to load patients"); })
      .finally(() => { if (!silent) setLoading(false); });
  };

  useEffect(() => load(), []);
  // New walk-ins and sign-ups from elsewhere appear without a manual refresh.
  useAutoRefresh(() => load(true));

  const rows: PatientRow[] = useMemo(() => {
    const accountRows: PatientRow[] = patients.map(p => ({
      key: p.id,
      name: p.name,
      age: p.age != null ? String(p.age) : "—",
      phone: p.phone || "—",
      email: p.email,
      patient: p,
      hasWalkIn: appointments.some(a => a.patientId === p.id && a.type === "walk-in"),
    }));

    // Guest walk-ins, grouped by the name taken at the desk. Fields the clinic never
    // collected are left blank rather than dashed, so it's obvious they're empty.
    const guests = new Map<string, Appointment[]>();
    for (const a of appointments.filter(a => !a.patientId)) {
      const list = guests.get(a.patientName) ?? [];
      list.push(a);
      guests.set(a.patientName, list);
    }
    const guestRows: PatientRow[] = [...guests.entries()].map(([name, own]) => ({
      key: `guest-${name}`,
      name,
      age: "",
      phone: own.find(a => a.contact)?.contact ?? "",
      email: own.find(a => a.email)?.email ?? "",
      patient: null,
      hasWalkIn: true,
    }));

    return [...accountRows, ...guestRows];
  }, [patients, appointments]);

  const textRows = useMemo(
    () => rows.map(r => [
      r.name,
      r.age || "—",
      r.phone || "—",
      r.email || "—",
      r.patient ? r.patient.status : "no account",
    ]),
    [rows],
  );
  const shown = useMemo(
    () => rows.map((row, i) => ({ row, text: textRows[i] })).filter(({ text }) => matchesReportFilter(text, filter)),
    [rows, textRows, filter],
  );
  const filtered = shown.map(s => s.row);

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "Patient Records Report",
      columns: COLUMNS,
      rows: shown.map(s => s.text),
      filters: filterIsActive(filter)
        ? [{ label: "Filtered By", value: describeReportFilter(COLUMNS, filter) ?? "" }]
        : undefined,
    });

  const handleFormChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (formErrors[field] || formErrors["general"]) {
      setFormErrors(prev => {
        const next = { ...prev };
        delete next[field];
        delete next["general"];
        return next;
      });
    }
  };

  const handleSave = async () => {
    const parsed = patientSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.errors.forEach(e => {
        const field = e.path[0] as string;
        if (!errors[field]) errors[field] = e.message;
      });
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    try {
      await createPatient({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        address: parsed.data.address,
        age: parsed.data.age,
      });
      toast.success("Patient saved successfully", { description: `${parsed.data.name} has been added to Patient Records.` });
      setShowAdd(false);
      setForm(emptyForm);
      setFormErrors({});
      load();
    } catch (err) {
      setFormErrors({ general: err instanceof Error ? err.message : "Failed to save patient" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (p: Patient) => {
    setEditingPatient(p);
    setEditForm({ name: p.name, age: p.age != null ? String(p.age) : "", phone: p.phone ?? "", email: p.email, address: p.address ?? "" });
    setEditErrors({});
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    if (editErrors[field] || editErrors["general"]) {
      setEditErrors(prev => {
        const next = { ...prev };
        delete next[field];
        delete next["general"];
        return next;
      });
    }
  };

  const handleUpdate = async () => {
    if (!editingPatient) return;
    const parsed = patientSchema.safeParse(editForm);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.errors.forEach(e => {
        const field = e.path[0] as string;
        if (!errors[field]) errors[field] = e.message;
      });
      setEditErrors(errors);
      return;
    }

    setSaving(true);
    try {
      await updatePatient(editingPatient.id, {
        name: parsed.data.name,
        phone: parsed.data.phone,
        address: parsed.data.address,
        age: parsed.data.age,
      });
      toast.success("Patient updated successfully", { description: `${parsed.data.name}'s record has been updated.` });
      setEditingPatient(null);
      load();
    } catch (err) {
      setEditErrors({ general: err instanceof Error ? err.message : "Failed to update patient" });
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
          <p className="text-xs">Patient Records · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient Records</h1>
          <p className="text-muted-foreground">Manage patient information and history</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">

        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Add Patient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">Add New Patient</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input placeholder="Patient name" value={form.name} onChange={e => handleFormChange("name", e.target.value)} />
                {formErrors.name && <p className="text-xs text-destructive mt-1">{formErrors.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Age <span className="text-destructive">*</span></Label>
                  <Input type="number" placeholder="Age" value={form.age} onChange={e => handleFormChange("age", e.target.value)} />
                  {formErrors.age && <p className="text-xs text-destructive mt-1">{formErrors.age}</p>}
                </div>
                <div>
                  <Label>Phone <span className="text-destructive">*</span></Label>
                  <Input placeholder="Phone number" value={form.phone} onChange={e => handleFormChange("phone", e.target.value)} />
                  {formErrors.phone && <p className="text-xs text-destructive mt-1">{formErrors.phone}</p>}
                </div>
              </div>
              <div>
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="Email" value={form.email} onChange={e => handleFormChange("email", e.target.value)} />
                {formErrors.email && <p className="text-xs text-destructive mt-1">{formErrors.email}</p>}
              </div>
              <div>
                <Label>Address <span className="text-destructive">*</span></Label>
                <Input placeholder="Address" value={form.address} onChange={e => handleFormChange("address", e.target.value)} />
                {formErrors.address && <p className="text-xs text-destructive mt-1">{formErrors.address}</p>}
              </div>
              {formErrors.general && <p className="text-sm text-destructive">{formErrors.general}</p>}
              <Button className="w-full gradient-primary text-primary-foreground" disabled={saving} onClick={handleSave}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Patient
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="print:hidden">
          <TableToolbar
            columns={COLUMNS}
            rows={textRows}
            filter={filter}
            onChange={setFilter}
            shown={filtered.length}
            noun="patient(s)"
            actions={
              <Button onClick={handlePrint} variant="outline" size="sm">
                <Printer className="w-4 h-4 mr-2" /> Print
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const p = r.patient;
                return (
                  <TableRow key={r.key}>
                    <TableCell>
                      {p ? (
                        <button className="font-medium text-primary hover:underline print:no-underline print:text-foreground" onClick={() => navigate(`/admin/patients/${p.id}`)}>{r.name}</button>
                      ) : (
                        <span className="font-medium">{r.name}</span>
                      )}
                    </TableCell>
                    <TableCell>{r.age}</TableCell>
                    <TableCell>{r.phone}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      {p ? (
                        <Badge variant={p.status === "active" ? "default" : "secondary"} className={p.status === "active" ? "bg-success/10 text-success border-success/20" : ""}>{p.status}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">no account</Badge>
                      )}
                    </TableCell>
                    <TableCell className="print:hidden">
                      {p && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/admin/patients/${p.id}`)}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Edit className="w-4 h-4" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No patients found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingPatient} onOpenChange={(o) => !o && setEditingPatient(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Edit Patient</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Patient name" value={editForm.name} onChange={e => handleEditFormChange("name", e.target.value)} />
              {editErrors.name && <p className="text-xs text-destructive mt-1">{editErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Age <span className="text-destructive">*</span></Label>
                <Input type="number" placeholder="Age" value={editForm.age} onChange={e => handleEditFormChange("age", e.target.value)} />
                {editErrors.age && <p className="text-xs text-destructive mt-1">{editErrors.age}</p>}
              </div>
              <div>
                <Label>Phone <span className="text-destructive">*</span></Label>
                <Input placeholder="Phone number" value={editForm.phone} onChange={e => handleEditFormChange("phone", e.target.value)} />
                {editErrors.phone && <p className="text-xs text-destructive mt-1">{editErrors.phone}</p>}
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editForm.email} disabled />
              <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
            </div>
            <div>
              <Label>Address <span className="text-destructive">*</span></Label>
              <Input placeholder="Address" value={editForm.address} onChange={e => handleEditFormChange("address", e.target.value)} />
              {editErrors.address && <p className="text-xs text-destructive mt-1">{editErrors.address}</p>}
            </div>
            {editErrors.general && <p className="text-sm text-destructive">{editErrors.general}</p>}
            <Button className="w-full gradient-primary text-primary-foreground" disabled={saving} onClick={handleUpdate}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
