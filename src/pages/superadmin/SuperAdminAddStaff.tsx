import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { addStaff, getAllStaff, nextEmployeeId, type StaffRole } from "@/lib/staffStore";
import { saveDentistSchedule } from "@/lib/dentistSchedules";

const schema = z
  .object({
    employeeId: z.string().trim().min(1, "Employee ID is required").max(30),
    firstName: z.string().trim().min(1, "First name is required").max(60),
    middleName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().min(1, "Last name is required").max(60),
    contact: z.string().trim().min(7, "Contact number is required").max(20),
    email: z.string().trim().email("Enter a valid email address").max(255),
    role: z.enum(["admin", "dentist"], { errorMap: () => ({ message: "Role is required" }) }),
    username: z.string().trim().min(3, "Username must be at least 3 characters").max(50),
    password: z.string().min(6, "Password must be at least 6 characters").max(100),
    confirmPassword: z.string().min(1, "Please confirm the password"),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: "Password and Confirm Password do not match",
    path: ["confirmPassword"],
  });

export default function SuperAdminAddStaff() {
  const navigate = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [form, setForm] = useState({
    employeeId: nextEmployeeId(),
    firstName: "",
    middleName: "",
    lastName: "",
    contact: "",
    email: "",
    role: "",
    username: "",
    password: "",
    confirmPassword: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    const d = parsed.data;
    const all = getAllStaff();
    if (all.some(s => s.id.toLowerCase() === d.employeeId.toLowerCase()))
      return toast.error("An account with this Employee ID already exists");
    if (all.some(s => s.email.toLowerCase() === d.email.toLowerCase()))
      return toast.error("An account with this email address already exists");
    if (all.some(s => (s.username ?? "").toLowerCase() === d.username.toLowerCase()))
      return toast.error("This username is already taken");

    const fullName = [d.firstName, d.middleName?.trim(), d.lastName].filter(Boolean).join(" ");
    addStaff({
      id: d.employeeId,
      name: fullName,
      email: d.email,
      contact: d.contact,
      username: d.username,
      role: d.role as StaffRole,
      status: "active",
    });
    if (d.role === "dentist") saveDentistSchedule(fullName, {});
    toast.success(`${d.role === "dentist" ? "Dentist" : "Admin"} account created successfully`);
    navigate("/superadmin/staff");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setConfirmCancel(true)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Add Staff Account</h1>
          <p className="text-muted-foreground">Create an Admin or Dentist account</p>
        </div>
      </div>

      <Card className="shadow-card max-w-2xl">
        <CardHeader><CardTitle className="font-heading text-lg">Account Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Employee ID *</Label>
            <Input value={form.employeeId} onChange={e => set("employeeId", e.target.value)} className="font-mono" placeholder="EMP-007" />
            <p className="text-xs text-muted-foreground mt-1">Must be unique. It cannot be changed after the account is created.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>First Name *</Label><Input value={form.firstName} onChange={e => set("firstName", e.target.value)} /></div>
            <div><Label>Middle Name</Label><Input value={form.middleName} onChange={e => set("middleName", e.target.value)} placeholder="Optional" /></div>
            <div><Label>Last Name *</Label><Input value={form.lastName} onChange={e => set("lastName", e.target.value)} /></div>
          </div>
          <div><Label>Contact Number *</Label><Input value={form.contact} onChange={e => set("contact", e.target.value)} placeholder="0917-555-0000" /></div>
          <div><Label>Email Address *</Label><Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@ayagdental.com" /></div>
          <div>
            <Label>Role *</Label>
            <Select value={form.role} onValueChange={v => set("role", v)}>
              <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="dentist">Dentist</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Username *</Label><Input value={form.username} onChange={e => set("username", e.target.value)} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Password *</Label><Input type="password" value={form.password} onChange={e => set("password", e.target.value)} /></div>
            <div><Label>Confirm Password *</Label><Input type="password" value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="gradient-primary text-primary-foreground" onClick={submit}>Save</Button>
            <Button variant="outline" onClick={() => setConfirmCancel(true)}>Cancel</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Discard this account?</DialogTitle>
            <DialogDescription>Nothing will be saved and you will return to Staff Management.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>Keep Editing</Button>
            <Button variant="destructive" onClick={() => navigate("/superadmin/staff")}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
