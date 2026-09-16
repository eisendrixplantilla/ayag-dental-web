import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import { dentistSchedules, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { Link } from "react-router-dom";
import {
  User as UserIcon,
  Camera,
  Lock,
  Mail,
  Phone,
  IdCard,
  Briefcase,
  CalendarDays,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,15}$/, "Enter a valid contact number"),
  email: z.string().trim().email("Enter a valid email address"),
});

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "New password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export default function DentistProfile() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState("+63 912 345 6789");
  const [email, setEmail] = useState(user?.email ?? "");
  const [photo, setPhoto] = useState<string | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);

  const schedule = useMemo(() => {
    if (!user) return undefined;
    return dentistSchedules.find((s) => s.id === user.id) ?? dentistSchedules.find((s) => s.name === user.name);
  }, [user]);

  const saveProfile = () => {
    const result = profileSchema.safeParse({ phone, email });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    toast.success("Profile updated", {
      description: "Your contact number and email address have been saved.",
    });
  };

  const changePassword = () => {
    const result = passwordSchema.safeParse(pw);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    setPw({ current: "", next: "", confirm: "" });
    toast.success("Password updated", {
      description: "Use your new password on your next sign-in.",
    });
  };

  const onPhotoPick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhoto(reader.result as string);
      toast.success("Profile picture updated");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Profile</h1>
        <p className="text-muted-foreground">Your account information</p>
      </div>

      {/* Identity / read-only section */}
      <Card className="shadow-card">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                {photo ? (
                  <img src={photo} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full shadow"
                onClick={() => fileRef.current?.click()}
                aria-label="Change profile picture"
              >
                <Camera className="w-4 h-4" />
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhotoPick(e.target.files?.[0])}
              />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-xl font-semibold font-heading text-foreground">{user?.name}</h2>
                <Badge variant="outline" className="bg-secondary text-secondary-foreground mt-1">Dentist</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <IdCard className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Employee ID</p>
                    <p className="font-medium text-foreground">EMP-{user?.id?.padStart(4, "0")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="font-medium text-foreground">Dentist</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Assigned Schedule</p>
                    {schedule ? (
                      <p className="font-medium text-foreground">
                        {schedule.workingDays.map((d) => DAYS[d].slice(0, 3)).join(", ")} ·{" "}
                        {toLabel(toMinutes(schedule.start))} - {toLabel(toMinutes(schedule.end))}
                      </p>
                    ) : (
                      <p className="font-medium text-muted-foreground">Not assigned</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Employee ID, Role, and Assigned Schedule can only be changed by the Super Admin.{" "}
                <Link to="/dentist/schedule" className="text-primary hover:underline">
                  View full schedule
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Editable contact info */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" /> Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Contact Number</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Email Address
              </Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button onClick={saveProfile} className="w-full">
              <Save className="w-4 h-4 mr-2" /> Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Password change */}
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-base flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" /> Change Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-pw">Current Password</Label>
              <Input
                id="current-pw"
                type={showPw ? "text" : "password"}
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="next-pw">New Password</Label>
              <Input
                id="next-pw"
                type={showPw ? "text" : "password"}
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm New Password</Label>
              <Input
                id="confirm-pw"
                type={showPw ? "text" : "password"}
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} className="accent-primary" />
              {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} Show passwords
            </label>
            <Button onClick={changePassword} variant="secondary" className="w-full">
              <Lock className="w-4 h-4 mr-2" /> Update Password
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
