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

const PHONE_REGEX = /^\+?[\d\s-]{7,15}$/;

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

    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Enter your first and last name");
      return;
    }
    if (!birthdate) {
      toast.error("Enter your date of birth");
      return;
    }
    if (new Date(birthdate) > new Date()) {
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
    if (!PHONE_REGEX.test(contactNumber.trim())) {
      toast.error("Enter a valid contact number");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
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
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        birthdate,
        sex,
        address: address.trim(),
        contactNumber: contactNumber.trim(),
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
          <div className="w-20 h-20 mx-auto mb-4 aspect-square rounded-2xl gradient-primary shadow-2xl shadow-primary/40 flex items-center justify-center">
            <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-2/3 h-2/3 object-contain drop-shadow-2xl" />
          </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="Juan" value={firstName} onChange={e => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Dela Cruz" value={lastName} onChange={e => setLastName(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="middleName">Middle Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input id="middleName" placeholder="Santos" value={middleName} onChange={e => setMiddleName(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="birthdate">Date of Birth</Label>
                  <Input id="birthdate" type="date" value={birthdate} onChange={e => setBirthdate(e.target.value)} max={new Date().toISOString().slice(0, 10)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select value={sex} onValueChange={setSex}>
                    <SelectTrigger id="sex"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" placeholder="123 Rizal St, Quezon City" value={address} onChange={e => setAddress(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactNumber">Contact Number</Label>
                <Input id="contactNumber" placeholder="09171234567" value={contactNumber} onChange={e => setContactNumber(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => handleEmailChange(e.target.value)}
                  className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
                  required
                />
                {emailError && <p className="text-xs text-destructive">{emailError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput id="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <PasswordInput id="confirmPassword" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} />
              </div>

              <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isLoading || !!emailError}>
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
