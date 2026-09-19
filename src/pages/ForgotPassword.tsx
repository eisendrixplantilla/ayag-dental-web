import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Mail, Lock, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

type Step = "email" | "code" | "password";

export default function ForgotPassword() {
  const { forgotPassword, verifyResetCode, resetPassword, isLoading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await forgotPassword(email);
      setStep("code");
      toast.success("Reset code sent to your email!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verifyResetCode(code);
      setStep("password");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await resetPassword(code, newPassword);
      toast.success("Password reset successfully! Please sign in.");
      navigate("/login");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 aspect-square rounded-2xl gradient-primary shadow-2xl shadow-primary/40 flex items-center justify-center">
            <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-2/3 h-2/3 object-contain drop-shadow-2xl" />
          </div>
          <h1 className="text-3xl font-bold font-heading text-foreground">Ayag Dental Clinic</h1>
        </div>

        <Card className="shadow-elevated border-border">
          <CardHeader className="text-center">
            {step === "email" && (
              <>
                <CardTitle className="font-heading text-xl">Forgot Password</CardTitle>
                <CardDescription>Enter your email to receive a password reset code</CardDescription>
              </>
            )}
            {step === "code" && (
              <>
                <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="font-heading text-xl">Enter Reset Code</CardTitle>
                <CardDescription>Enter the 6-digit code sent to your email</CardDescription>
              </>
            )}
            {step === "password" && (
              <>
                <CardTitle className="font-heading text-xl">Set New Password</CardTitle>
                <CardDescription>Choose a new password for your account</CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {step === "email" && (
              <form onSubmit={handleSendCode} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send Reset Code
                </Button>
                <div className="text-center">
                  <Link to="/login" className="text-sm text-primary font-medium hover:underline">
                    <ArrowLeft className="inline w-4 h-4 mr-1" />Back to Login
                  </Link>
                </div>
              </form>
            )}

            {step === "code" && (
              <form onSubmit={handleVerifyCode} className="space-y-6">
                <p className="text-sm text-muted-foreground text-center">
                  We've sent a reset code to <span className="font-medium text-foreground">{email}</span>. Please check your inbox.
                </p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={code} onChange={setCode} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric">
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground"
                  disabled={isLoading || code.length < 6}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Verify Code
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setStep("email")}>
                  Use a different email
                </Button>
              </form>
            )}

            {step === "password" && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <PasswordInput
                      id="newPassword"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <PasswordInput
                      id="confirmPassword"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="pl-10"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Reset Password
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
