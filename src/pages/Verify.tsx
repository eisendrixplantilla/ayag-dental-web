import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRoleHome } from "@/lib/roleHome";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Hint from "@/components/Hint";

export default function Verify() {
  const [code, setCode] = useState("");
  const { verify, isLoading, pendingEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const verifiedUser = await verify(code);
      toast.success("Account verified!");
      navigate(getRoleHome(verifiedUser.role), { replace: true });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <Hint label="Back to the home page">
            <Link to="/" aria-label="Back to the home page" className="w-20 h-20 mx-auto mb-4 aspect-square rounded-2xl gradient-primary shadow-2xl shadow-primary/40 flex items-center justify-center hover:opacity-90 transition-opacity">
              <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-2/3 h-2/3 object-contain drop-shadow-2xl" />
            </Link>
          </Hint>
          <h1 className="text-3xl font-bold font-heading text-foreground">Ayag Dental Clinic</h1>
        </div>

        <Card className="shadow-elevated border-border">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <CardTitle className="font-heading text-xl">Verify Your Account</CardTitle>
            <CardDescription>
              {pendingEmail ? (
                <>Enter the 6-digit code sent to <span className="block font-medium text-foreground [overflow-wrap:anywhere]">{pendingEmail}</span></>
              ) : (
                "There's no sign-up waiting to be verified in this browser tab."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingEmail ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-center">
                  {/* one-time-code lets a phone offer the code straight from the email */}
                  <InputOTP maxLength={6} value={code} onChange={setCode} pattern={REGEXP_ONLY_DIGITS} inputMode="numeric" autoComplete="one-time-code">
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} className="h-12 w-11 text-lg" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button type="submit" className="w-full gradient-primary text-primary-foreground" disabled={isLoading || code.length < 6}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Verify Account
                </Button>
              </form>
            ) : (
              <Button asChild className="w-full gradient-primary text-primary-foreground">
                <Link to="/register">Create Account</Link>
              </Button>
            )}
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {pendingEmail ? "Wrong email, or the code expired? " : "Already verified? "}
              <Link to={pendingEmail ? "/register" : "/login"} className="text-primary font-medium hover:underline">
                {pendingEmail ? "Sign up again" : "Sign In"}
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
