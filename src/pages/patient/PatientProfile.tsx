import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPatient, updatePatient } from "@/lib/api/patients";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { z } from "zod";
import {
  User as UserIcon,
  Camera,
  Lock,
  Mail,
  Phone,
  MapPin,
  IdCard,
  Save,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";

const profileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s-]{7,15}$/, "Enter a valid contact number"),
  address: z.string().trim().min(1, "Address is required"),
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

export default function PatientProfile() {
  const { user, changePassword } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    getPatient(user.id)
      .then((p) => {
        setPhone(p.phone ?? "");
        setAddress(p.address ?? "");
      })
      .catch(() => toast.error("Failed to load profile information"))
      .finally(() => setLoadingProfile(false));
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    const result = profileSchema.safeParse({ phone, address });
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    setSavingProfile(true);
    try {
      await updatePatient(user.id, { phone, address });
      toast.success("Profile updated", {
        description: "Your contact information has been saved.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const submitPasswordChange = async () => {
    const result = passwordSchema.safeParse(pw);
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }
    setChangingPw(true);
    try {
      await changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      toast.success("Password updated", {
        description: "Use your new password on your next sign-in.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setChangingPw(false);
    }
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
                <Badge variant="outline" className="bg-secondary text-secondary-foreground mt-1">Patient</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <IdCard className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Patient ID</p>
                    <p className="font-medium text-foreground">PT-{user?.id?.padStart(4, "0")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Account Email</p>
                    <p className="font-medium text-foreground">{user?.email}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Full name and Patient ID can only be changed by the clinic administrator.
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
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loadingProfile}
                placeholder={loadingProfile ? "Loading..." : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address" className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> Address
              </Label>
              <Input
                id="address"
                placeholder={loadingProfile ? "Loading..." : "Your address"}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={loadingProfile}
              />
            </div>
            <Button onClick={saveProfile} className="w-full" disabled={loadingProfile || savingProfile}>
              {savingProfile ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Save Changes
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
            <Button onClick={submitPasswordChange} variant="secondary" className="w-full" disabled={changingPw}>
              {changingPw ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />} Update Password
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
