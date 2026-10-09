import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL } from "@/lib/tableClass";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Eye, Edit, Loader2, Printer, Link2, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { getPatients, createPatient, updatePatient, type Patient } from "@/lib/api/patients";
import { getAppointments, linkGuestToAccount, type Appointment } from "@/lib/api/appointments";
import { formatManilaDate } from "@/lib/formatDate";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import TableToolbar from "@/components/TableToolbar";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { EMPTY_FILTER, describeReportFilter, filterIsActive, matchesReportFilter } from "@/lib/reportFilter";
import { ageFrom, compareAge, compareGender, compareName, comparePhone, type MatchLevel } from "@/lib/guestMatch";

const COLUMNS = ["Name", "Age", "Phone", "Email", "Status", "Walk-in"];

// A walk-in booked for someone with no account has no patients row behind it: there's
// nothing to open, edit or archive. Once they sign up, staff can link it to the account.
interface PatientRow {
  key: string;
  name: string;
  age: string;
  phone: string;
  email: string;
  patient: Patient | null;
  /** Has at least one walk-in visit — true for every guest, and for account holders booked at the desk. */
  hasWalkIn: boolean;
  /** Guests only: how many walk-ins were booked under this name. */
  visits: number;
}

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

  // Linking a guest (walk-ins with no account) to the account they've since made.
  const [linking, setLinking] = useState<PatientRow | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkTarget, setLinkTarget] = useState<Patient | null>(null);
  const [linkSaving, setLinkSaving] = useState(false);

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
      visits: 0,
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
      visits: own.length,
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
      r.hasWalkIn ? "Yes" : "No",
    ]),
    [rows],
  );
  const shown = useMemo(
    () => rows.map((row, i) => ({ row, text: textRows[i] })).filter(({ text }) => matchesReportFilter(text, filter)),
    [rows, textRows, filter],
  );
  const filtered = shown.map(s => s.row);
  const { page, setPage, paged } = usePagination(filtered, filter);

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

  // Accounts to link a guest to. The likely one — same contact number or same name —
  // is suggested first, but staff always choose; nothing is linked on a guess.
  const linkCandidates = useMemo(() => {
    if (!linking) return [];
    const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
    const phone = digits(linking.phone);
    const name = linking.name.trim().toLowerCase();
    const q = linkSearch.trim().toLowerCase();
    return patients
      .map(p => ({ p, suggested: (!!phone && digits(p.phone) === phone) || p.name.trim().toLowerCase() === name }))
      .filter(({ p }) => !q || [p.name, p.phone ?? "", p.email ?? ""].some(v => v.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.p.name.localeCompare(b.p.name));
  }, [linking, linkSearch, patients]);

  // What the desk took down at the guest's walk-ins, newest first, to compare with an account.
  const linkGuest = useMemo(() => {
    if (!linking) return null;
    const visits = appointments
      .filter(a => !a.patientId && a.patientName === linking.name)
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    return {
      name: linking.name,
      contact: visits.find(v => v.contact)?.contact ?? (linking.phone || null),
      age: visits.find(v => v.age != null)?.age ?? null,
      gender: visits.find(v => v.gender)?.gender ?? null,
      visits,
    };
  }, [linking, appointments]);

  const openLink = (row: PatientRow) => {
    setLinking(row);
    setLinkSearch("");
    setLinkTarget(null);
  };

  const confirmLink = async () => {
    if (!linking || !linkTarget) return;
    setLinkSaving(true);
    try {
      const moved = await linkGuestToAccount(linking.name, linkTarget.id);
      toast.success(`Linked to ${linkTarget.name}'s account`, {
        description: `${moved} walk-in visit${moved === 1 ? "" : "s"} now show in their history.`,
      });
      setLinking(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link to the account");
    } finally {
      setLinkSaving(false);
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
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Walk-in</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(r => {
                const p = r.patient;
                return (
                  <TableRow key={r.key}>
                    <TableCell className={WRAP_CELL}>
                      {p ? (
                        <button className="font-medium text-primary hover:underline print:no-underline print:text-foreground" onClick={() => navigate(`/admin/patients/${p.id}`)}>{r.name}</button>
                      ) : (
                        <span className="font-medium">{r.name}</span>
                      )}
                    </TableCell>
                    <TableCell>{r.age}</TableCell>
                    <TableCell className={WRAP_CELL}>{r.phone}</TableCell>
                    <TableCell className={WRAP_CELL}>{r.email}</TableCell>
                    <TableCell>
                      {p ? (
                        <Badge variant={p.status === "active" ? "default" : "secondary"} className={p.status === "active" ? "bg-success/10 text-success border-success/20" : ""}>{p.status}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">no account</Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.hasWalkIn ? "Yes" : "No"}</TableCell>
                    <TableCell className="print:hidden">
                      {p ? (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/admin/patients/${p.id}`)}><Eye className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Edit className="w-4 h-4" /></Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-primary"
                          aria-label={`Link ${r.name} to an account`}
                          title="Link to the account this patient has made"
                          onClick={() => openLink(r)}
                        >
                          <Link2 className="w-4 h-4 mr-1" /> Link
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No patients found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          )}
        <TablePagination
          page={page}
          onPageChange={setPage}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          noun="patient(s)"
        />
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

      <Dialog open={!!linking} onOpenChange={(o) => !o && setLinking(null)}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading">Link to an account</DialogTitle></DialogHeader>
          {linking && linkGuest && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Once this patient has signed up online, choose their account to move these walk-ins, and their
                dental records, into it. Compare the details first.
              </p>

              {/* What the desk recorded for the guest. */}
              <section aria-label="Guest details" className="rounded-md border bg-muted/30 p-3 text-sm space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Walk-in guest (no account)</p>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
                  <div><dt className="text-xs text-muted-foreground">Name</dt><dd className="font-medium">{linkGuest.name}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Contact</dt><dd className="font-medium">{linkGuest.contact ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Age</dt><dd className="font-medium">{linkGuest.age ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Gender</dt><dd className="font-medium">{linkGuest.gender ?? "—"}</dd></div>
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {linkGuest.visits.length} walk-in visit{linkGuest.visits.length === 1 ? "" : "s"}
                  </p>
                  <ul className="text-xs">
                    {linkGuest.visits.slice(0, 3).map(v => (
                      <li key={v.id}>{formatManilaDate(v.date)} · {v.service}{v.dentistName ? ` · ${v.dentistName}` : ""}</li>
                    ))}
                    {linkGuest.visits.length > 3 && <li className="text-muted-foreground">and {linkGuest.visits.length - 3} more</li>}
                  </ul>
                </div>
              </section>

              <Input
                placeholder="Search by name, phone or email"
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                aria-label="Search patient accounts"
              />
              <div role="listbox" aria-label="Patient accounts" className="max-h-52 overflow-y-auto rounded-md border divide-y">
                {linkCandidates.map(({ p, suggested }) => {
                  const age = ageFrom(p.birthdate) ?? p.age;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={linkTarget?.id === p.id}
                      onClick={() => setLinkTarget(p)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/60 ${linkTarget?.id === p.id ? "bg-primary/10" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        {suggested && <Badge variant="outline" className="text-[10px] font-normal border-primary/30 text-primary">Suggested</Badge>}
                      </span>
                      <span className="block text-xs text-muted-foreground">{p.phone || "—"} · {p.email || "—"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {age != null ? `${age} yrs` : "Age —"} · {p.gender || "Gender —"}
                        {p.birthdate ? ` · Born ${formatManilaDate(p.birthdate)}` : ""}
                        {p.createdAt ? ` · Signed up ${formatManilaDate(p.createdAt)}` : ""}
                      </span>
                    </button>
                  );
                })}
                {linkCandidates.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No matching account. Ask the patient to sign up online first.
                  </p>
                )}
              </div>

              {linkTarget && <LinkComparison guest={linkGuest} account={linkTarget} />}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLinking(null)}>Cancel</Button>
                <Button className="gradient-primary text-primary-foreground" disabled={!linkTarget || linkSaving} onClick={confirmLink}>
                  {linkSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {linkTarget ? `Link to ${linkTarget.name}` : "Choose an account"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const MATCH_STYLE: Record<MatchLevel, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  match: { label: "Match", className: "text-success", Icon: CheckCircle2 },
  close: { label: "Check", className: "text-warning", Icon: AlertTriangle },
  differs: { label: "Different", className: "text-destructive", Icon: AlertTriangle },
  unknown: { label: "Not on file", className: "text-muted-foreground", Icon: HelpCircle },
};

/** The guest's details beside the chosen account's, field by field, before linking. */
function LinkComparison({ guest, account }: {
  guest: { name: string; contact: string | null; age: number | null; gender: string | null };
  account: Patient;
}) {
  const accountAge = ageFrom(account.birthdate) ?? account.age;
  const rows: [string, string, string, MatchLevel][] = [
    ["Name", guest.name, account.name, compareName(guest.name, account.name)],
    ["Contact", guest.contact ?? "—", account.phone ?? "—", comparePhone(guest.contact, account.phone)],
    ["Age", guest.age != null ? String(guest.age) : "—", accountAge != null ? String(accountAge) : "—", compareAge(guest.age, accountAge)],
    ["Gender", guest.gender ?? "—", account.gender ?? "—", compareGender(guest.gender, account.gender)],
  ];
  const doubtful = rows.some(([, , , level]) => level === "close" || level === "differs");
  return (
    <section aria-label="Compare before linking" className="rounded-md border p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compare before linking</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground text-left">
            <th className="font-normal py-1 pr-2"><span className="sr-only">Detail</span></th>
            <th className="font-normal py-1 pr-2">Walk-in guest</th>
            <th className="font-normal py-1 pr-2">Account</th>
            <th className="font-normal py-1"><span className="sr-only">Result</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, g, a, level]) => {
            const { label: verdict, className, Icon } = MATCH_STYLE[level];
            return (
              <tr key={label} className="border-t">
                <th scope="row" className="text-left text-xs font-normal text-muted-foreground py-1.5 pr-2">{label}</th>
                <td className="py-1.5 pr-2">{g}</td>
                <td className="py-1.5 pr-2">{a}</td>
                <td className={`py-1.5 text-xs whitespace-nowrap ${className}`}>
                  <span className="inline-flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{verdict}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={`text-xs ${doubtful ? "text-warning" : "text-muted-foreground"}`}>
        {doubtful
          ? "Some details need a closer look. Ask the patient to log in and show their Profile, or check a valid ID, before linking."
          : "To be sure, ask the patient to log in and show their Profile, or check a valid ID."}
      </p>
    </section>
  );
}
