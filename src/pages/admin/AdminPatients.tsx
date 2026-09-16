import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Plus, Search, Eye, Edit } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const mockPatients = [
  { id: "P001", name: "Maria Garcia", age: 32, phone: "09123456789", email: "maria@email.com", address: "Quezon City", lastVisit: "2024-03-10", status: "active" },
  { id: "P002", name: "James Wilson", age: 45, phone: "09234567890", email: "james@email.com", address: "Manila", lastVisit: "2024-03-08", status: "active" },
  { id: "P003", name: "Emma Davis", age: 28, phone: "09345678901", email: "emma@email.com", address: "Pasig", lastVisit: "2024-02-28", status: "active" },
  { id: "P004", name: "Robert Brown", age: 55, phone: "09456789012", email: "robert@email.com", address: "Makati", lastVisit: "2024-01-15", status: "inactive" },
  { id: "P005", name: "Lisa Anderson", age: 38, phone: "09567890123", email: "lisa@email.com", address: "Taguig", lastVisit: "2024-03-12", status: "active" },
];

const patientSchema = z.object({
  name: z.string().trim().min(1, "Full name is required"),
  age: z.coerce.number().int().min(1, "Age is required").max(120, "Age must be valid"),
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email address"),
  address: z.string().trim().min(1, "Address is required"),
});

export default function AdminPatients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [patients, setPatients] = useState(mockPatients);
  const [form, setForm] = useState({ name: "", age: "", phone: "", email: "", address: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const filtered = patients.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase());
    const matchesFrom = !fromDate || p.lastVisit >= fromDate;
    const matchesTo = !toDate || p.lastVisit <= toDate;
    return matchesSearch && matchesFrom && matchesTo;
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

  const handleSave = () => {
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

    const emailExists = patients.find(p => p.email.toLowerCase() === parsed.data.email.toLowerCase());
    const phoneExists = patients.find(p => p.phone === parsed.data.phone);

    if (emailExists || phoneExists) {
      const errors: Record<string, string> = {};
      if (emailExists) errors.email = "A patient with this email already exists";
      if (phoneExists) errors.phone = "A patient with this contact number already exists";
      setFormErrors(errors);
      return;
    }

    const newId = `P${String(patients.length + 1).padStart(3, "0")}`;
    const today = new Date().toISOString().split("T")[0];
    setPatients(prev => [...prev, {
      id: newId,
      name: parsed.data.name,
      age: parsed.data.age,
      phone: parsed.data.phone,
      email: parsed.data.email,
      address: parsed.data.address,
      lastVisit: today,
      status: "active",
    }]);

    toast.success("Patient saved successfully", {
      description: `${parsed.data.name} has been added to Patient Records.`,
    });

    setTimeout(() => {
      setShowAdd(false);
      setForm({ name: "", age: "", phone: "", email: "", address: "" });
      setFormErrors({});
      navigate("/admin/patients");
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Patient Records</h1>
          <p className="text-muted-foreground">Manage patient information and history</p>
        </div>
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
              <Button className="w-full gradient-primary text-primary-foreground" onClick={handleSave}>Save Patient</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search patients..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
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
                <TableHead>Name</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.id}</TableCell>
                  <TableCell>
                    <button className="font-medium text-primary hover:underline" onClick={() => navigate(`/admin/patients/${p.id}`)}>{p.name}</button>
                  </TableCell>
                  <TableCell>{p.age}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell>{p.lastVisit}</TableCell>
                  <TableCell><Badge variant={p.status === "active" ? "default" : "secondary"} className={p.status === "active" ? "bg-success/10 text-success border-success/20" : ""}>{p.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/admin/patients/${p.id}`)}><Eye className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
