import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { createStaff } from "@/lib/api/staff";
import MobileInput from "@/components/MobileInput";
import { PasswordLengthCheck, PasswordMatchCheck } from "@/components/PasswordChecks";
import { passwordsReady } from "@/lib/inputRules";
import { cleanName, formatName, PH_MOBILE } from "@/lib/inputRules";
import { manilaTodayDateStr } from "@/lib/formatDate";

/** What the new account's ID starts with: DT- or AN-, then this year and month (YYMM).
 * Its number that month is given by the server when the account is saved. */
const employeeIdStart = (role: string) => {
  const [y, m] = manilaTodayDateStr().split("-");
  return `${role === "admin" ? "AN" : role === "dentist" ? "DT" : "DT/AN"}-${y.slice(2)}${m}`;
};

const schema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(60),
    middleName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().min(1, "Last name is required").max(60),
    contact: z.string().trim().regex(PH_MOBILE, "Enter an 11-digit mobile number starting with 09"),
    email: z.string().trim().email("Enter a valid email address").max(255),
    role: z.enum(["admin", "dentist"], { errorMap: () => ({ message: "Role is required" }) }),
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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    contact: "",
    email: "",
    role: "",
    password: "",
    confirmPassword: "",
  });

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    const d = parsed.data;
    const fullName = [d.firstName, d.middleName?.trim(), d.lastName].filter(Boolean).join(" ");
    setSaving(true);
    try {
      await createStaff({
        name: fullName,
        email: d.email,
        contact: d.contact,
        role: d.role as "admin" | "dentist",
        password: d.password,
      });
      toast.success(`${d.role === "dentist" ? "Dentist" : "Admin"} account created successfully`);
      navigate("/superadmin/staff");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create staff account");
    } finally {
      setSaving(false);
    }
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
            <Label>Employee ID</Label>
            <p className="mt-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground">
              {employeeIdStart(form.role)}<span className="text-muted-foreground">##</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Given automatically when the account is saved: DT for a dentist or AN for an admin, the year and month,
              then its number among those made this month (01, 02…). It can't be changed later.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>First Name *</Label><Input autoCapitalize="words" value={form.firstName} onChange={e => set("firstName", formatName(e.target.value))} onBlur={() => set("firstName", cleanName(form.firstName))} /></div>
            <div><Label>Middle Name</Label><Input autoCapitalize="words" value={form.middleName} onChange={e => set("middleName", formatName(e.target.value))} onBlur={() => set("middleName", cleanName(form.middleName))} placeholder="Optional" /></div>
            <div><Label>Last Name *</Label><Input autoCapitalize="words" value={form.lastName} onChange={e => set("lastName", formatName(e.target.value))} onBlur={() => set("lastName", cleanName(form.lastName))} /></div>
          </div>
          <div><Label>Contact Number *</Label><MobileInput value={form.contact} onValueChange={v => set("contact", v)} /></div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Password *</Label><PasswordInput autoComplete="new-password" value={form.password} onChange={e => set("password", e.target.value)} /><PasswordLengthCheck password={form.password} minLength={6} /></div>
            <div className="space-y-1"><Label>Confirm Password *</Label><PasswordInput autoComplete="new-password" value={form.confirmPassword} onChange={e => set("confirmPassword", e.target.value)} /><PasswordMatchCheck password={form.password} confirm={form.confirmPassword} /></div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="gradient-primary text-primary-foreground" onClick={submit} disabled={saving || !passwordsReady(form.password, form.confirmPassword, 6)}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save
            </Button>
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
