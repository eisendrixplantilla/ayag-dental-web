import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getPatient, updatePatient, type Patient } from "@/lib/api/patients";
import { resizeImageToDataUrl } from "@/lib/resizeImage";
import { patientRef, ageFromBirthdate, formatBirthdate } from "@/lib/patientRef";
import { statusLabel } from "@/lib/roleLabel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { manilaTodayDateStr } from "@/lib/formatDate";
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
  Cake,
  Users,
  Droplet,
  TriangleAlert,
  CalendarDays,
  BadgeCheck,
  Pencil,
} from "lucide-react";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
/** Radix Select can't hold an empty value, so "I don't know" needs a stand-in that the
 * save turns back into a blank column. */
const UNKNOWN_BLOOD_TYPE = "__unknown__";

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

  // The whole `patients` row, so the page shows what the clinic holds rather than the
  // name and email cached in this browser at sign-in — those go stale the moment the
  // front desk corrects a record.
  const [record, setRecord] = useState<Patient | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [editingDetails, setEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [details, setDetails] = useState({ birthdate: "", gender: "", bloodType: "", allergies: "" });

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    getPatient(user.id)
      .then((p) => {
        setRecord(p);
        setPhone(p.phone ?? "");
        setAddress(p.address ?? "");
        setPhoto(p.photoUrl ?? null);
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
      setRecord(await updatePatient(user.id, { phone, address }));
      toast.success("Profile updated", {
        description: "Your contact information has been saved.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const startEditingDetails = () => {
    setDetails({
      birthdate: record?.birthdate ?? "",
      gender: record?.gender ?? "",
      bloodType: record?.bloodType ?? "",
      allergies: record?.allergies ?? "",
    });
    setEditingDetails(true);
  };

  const saveDetails = async () => {
    if (!user) return;
    // A birthdate that's already on file can be corrected but not taken away — a blank
    // one would be silently ignored by the server, which looks like a save that worked.
    if (!details.birthdate && record?.birthdate) {
      toast.error("Date of birth can't be removed", {
        description: "Correct it if it's wrong, or ask the front desk to clear it.",
      });
      return;
    }
    if (details.birthdate && details.birthdate > manilaTodayDateStr()) {
      toast.error("Date of birth can't be in the future");
      return;
    }
    setSavingDetails(true);
    try {
      const updated = await updatePatient(user.id, {
        ...(details.birthdate ? { birthdate: details.birthdate } : {}),
        gender: details.gender,
        bloodType: details.bloodType === UNKNOWN_BLOOD_TYPE ? "" : details.bloodType,
        allergies: details.allergies.trim(),
      });
      setRecord(updated);
      setEditingDetails(false);
      toast.success("Personal details updated", {
        description: "Your clinic record has been saved.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update your details");
    } finally {
      setSavingDetails(false);
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

  const onPhotoPick = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploadingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const updated = await updatePatient(user.id, { photo: dataUrl });
      setRecord(updated);
      setPhoto(updated.photoUrl ?? dataUrl);
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile picture");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // The table keeps both: a birthdate from online registration, and a plain age for rows
  // the front desk typed in. Show the birthdate when there is one, and the age it implies.
  const age = ageFromBirthdate(record?.birthdate) ?? record?.age ?? null;
  const birthdateText = record?.birthdate
    ? `${formatBirthdate(record.birthdate)}${age !== null ? ` (${age} years old)` : ""}`
    : age !== null
      ? `${age} years old`
      : null;

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
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
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
                <h2 className="text-xl font-semibold font-heading text-foreground">
                  {record?.name ?? user?.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <Badge variant="outline" className="bg-secondary text-secondary-foreground">Patient</Badge>
                  {record && (
                    <Badge
                      variant="outline"
                      className={record.status === "active"
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-muted text-muted-foreground"}
                    >
                      <BadgeCheck className="w-3 h-3 mr-1" /> {statusLabel(record.status)}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <IdCard className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Patient ID</p>
                    <p className="font-medium text-foreground">
                      {record ? patientRef(record.id) : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Account Email</p>
                    <p className="font-medium text-foreground">{record?.email ?? user?.email}</p>
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

      {/* What the clinic holds on file. The patient maintains the top four themselves;
          the two below them are derived and can't be typed over. */}
      <Card className="shadow-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="font-heading text-base flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-primary" /> Personal Details
          </CardTitle>
          {!loadingProfile && !editingDetails && (
            <Button variant="outline" size="sm" onClick={startEditingDetails}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loadingProfile ? (
            <p className="text-sm text-muted-foreground">Loading your details...</p>
          ) : editingDetails ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birthdate" className="flex items-center gap-1">
                    <Cake className="w-3.5 h-3.5" /> Date of Birth
                  </Label>
                  <Input
                    id="birthdate"
                    type="date"
                    value={details.birthdate}
                    max={manilaTodayDateStr()}
                    onChange={(e) => setDetails({ ...details, birthdate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex" className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Sex
                  </Label>
                  <Select
                    value={details.gender}
                    onValueChange={(v) => setDetails({ ...details, gender: v })}
                  >
                    <SelectTrigger id="sex" aria-label="Sex">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="blood-type" className="flex items-center gap-1">
                    <Droplet className="w-3.5 h-3.5" /> Blood Type
                  </Label>
                  <Select
                    value={details.bloodType}
                    onValueChange={(v) => setDetails({ ...details, bloodType: v })}
                  >
                    <SelectTrigger id="blood-type" aria-label="Blood Type">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNKNOWN_BLOOD_TYPE}>I don't know</SelectItem>
                      {BLOOD_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="allergies" className="flex items-center gap-1">
                  <TriangleAlert className="w-3.5 h-3.5" /> Allergies
                </Label>
                <Textarea
                  id="allergies"
                  rows={2}
                  placeholder="Anything the dentist should know about — medicines, anaesthetic, latex. Leave blank if none."
                  value={details.allergies}
                  onChange={(e) => setDetails({ ...details, allergies: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Your dentist sees this before treating you, so keep it up to date.
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveDetails} disabled={savingDetails}>
                  {savingDetails ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Details
                </Button>
                <Button variant="ghost" onClick={() => setEditingDetails(false)} disabled={savingDetails}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Detail icon={Cake} label="Date of Birth" value={birthdateText} />
              <Detail icon={Users} label="Sex" value={record?.gender} />
              <Detail icon={Droplet} label="Blood Type" value={record?.bloodType} />
              <Detail icon={TriangleAlert} label="Allergies" value={record?.allergies} empty="None on file" />
              <Detail icon={CalendarDays} label="Patient Since" value={record?.createdAt} />
              <Detail
                icon={BadgeCheck}
                label="Records on File"
                value={record ? `${record.appointmentsCount ?? 0} appointments · ${record.dentalRecordsCount ?? 0} dental records` : null}
              />
            </dl>
          )}
          {!editingDetails && (
            <p className="text-xs text-muted-foreground mt-4">
              Patient Since and Records on File come from your clinic record and can't be edited here.
            </p>
          )}
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

/** One read-only field from the patient's clinic record. A field the clinic hasn't filled
 * in reads as "Not on file" rather than sitting blank, so it's clear nothing is missing
 * from the page itself. */
function Detail({
  icon: Icon,
  label,
  value,
  empty = "Not on file",
}: {
  icon: typeof Cake;
  label: string;
  value: string | null | undefined;
  empty?: string;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={value ? "font-medium text-foreground break-words" : "text-muted-foreground"}>
          {value || empty}
        </dd>
      </div>
    </div>
  );
}
