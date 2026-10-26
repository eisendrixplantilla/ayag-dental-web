import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, emailExists } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { cleanName, formatName, PH_MOBILE } from "@/lib/inputRules";
import MobileInput from "@/components/MobileInput";
import { PasswordLengthCheck, PasswordMatchCheck } from "@/components/PasswordChecks";
import { passwordsReady } from "@/lib/inputRules";
import Hint from "@/components/Hint";
import { DatePicker } from "@/components/DatePicker";

const MIN_PASSWORD = 6;

/** The mark on a required field's label. Screen readers already hear "required" from
 * the field itself, so the star is for the eye only. */
const Req = () => <span className="text-destructive" aria-hidden="true">*</span>;

export default function Register() {
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [sex, setSex] = useState("");
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailError, setEmailError] = useState("");

  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleEmailChange = async (value: string) => {
    setEmail(value);
    if (!value.trim()) {
      setEmailError("");
      return;
    }
    setEmailError((await emailExists(value)) ? "An account with this email already exists" : "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cleanName(firstName) || !cleanName(lastName)) {
      toast.error("Enter your first and last name");
      return;
    }
    if (!birthdate) {
      toast.error("Enter your date of birth");
      return;
    }
    if (birthdate > manilaTodayDateStr()) {
      toast.error("Date of birth cannot be in the future");
      return;
    }
    if (!sex) {
      toast.error("Select your sex");
      return;
    }
    if (!address.trim()) {
      toast.error("Enter your address");
      return;
    }
    if (!PH_MOBILE.test(contactNumber)) {
      toast.error("Enter an 11-digit mobile number starting with 09");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      toast.error(`Password must be at least ${MIN_PASSWORD} characters`);
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (await emailExists(email)) {
      setEmailError("An account with this email already exists");
      return;
    }

    try {
      await register({
        firstName: cleanName(firstName),
        middleName: cleanName(middleName) || undefined,
        lastName: cleanName(lastName),
        birthdate,
        sex,
        address: address.trim(),
        contactNumber,
        email,
        password,
      });
      toast.success("Account created! Please verify your email.");
      navigate("/verify");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <Hint label="Back to the home page">
            <Link to="/" aria-label="Back to the home page" className="w-20 h-20 mx-auto mb-4 aspect-square rounded-2xl gradient-primary shadow-2xl shadow-primary/40 flex items-center justify-center hover:opacity-90 transition-opacity">
              <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-2/3 h-2/3 object-contain drop-shadow-2xl" />
            </Link>
          </Hint>
          <h1 className="text-3xl font-bold font-heading text-foreground">Ayag Dental Clinic</h1>
          <p className="text-muted-foreground mt-1">Create your account</p>
        </div>

        <Card className="shadow-elevated border-border">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-xl">Get Started</CardTitle>
            <CardDescription>Fill in your details to create an account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-muted-foreground">Fields marked <Req /> are required.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name <Req /></Label>
                  <Input id="firstName" autoComplete="given-name" placeholder="Juan" value={firstName} onChange={e => setFirstName(formatName(e.target.value))} onBlur={() => setFirstName(cleanName(firstName))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name <Req /></Label>
                  <Input id="lastName" autoComplete="family-name" placeholder="Dela Cruz" value={lastName} onChange={e => setLastName(formatName(e.target.value))} onBlur={() => setLastName(cleanName(lastName))} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="middleName">Middle Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="middleName" autoComplete="additional-name" placeholder="Santos" value={middleName} onChange={e => setMiddleName(formatName(e.target.value))} onBlur={() => setMiddleName(cleanName(middleName))} />
              </div>

              {/* A phone's half-width is too narrow for the browser's date picker. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="birthdate">Date of Birth <Req /></Label>
                  <DatePicker id="birthdate" value={birthdate} onChange={setBirthdate} max={manilaTodayDateStr()} placeholder="Pick your birthday" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex <Req /></Label>
                  <Select value={sex} onValueChange={setSex}>
                    <SelectTrigger id="sex" aria-required="true"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address <Req /></Label>
                <Input id="address" autoComplete="street-address" placeholder="123 Rizal St, Quezon City" value={address} onChange={e => setAddress(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactNumber">Contact Number <Req /></Label>
                <MobileInput id="contactNumber" value={contactNumber} onValueChange={setContactNumber} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email <Req /></Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                  className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
                  required
                />
                {emailError && <p className="text-xs text-destructive">{emailError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password <Req /></Label>
                <PasswordInput id="password" autoComplete="new-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={MIN_PASSWORD} />
                <PasswordLengthCheck password={password} minLength={MIN_PASSWORD} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password <Req /></Label>
                <PasswordInput id="confirmPassword" autoComplete="new-password" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={MIN_PASSWORD} />
                <PasswordMatchCheck password={password} confirm={confirmPassword} />
              </div>

              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isLoading || !!emailError || !passwordsReady(password, confirmPassword, MIN_PASSWORD)}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary font-medium hover:underline">Sign In</Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
