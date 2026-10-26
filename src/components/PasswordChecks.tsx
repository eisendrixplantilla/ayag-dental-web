import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

function Line({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-xs", ok ? "text-success" : "text-destructive")}>
      {ok ? <Check className="w-3.5 h-3.5 shrink-0" aria-hidden /> : <X className="w-3.5 h-3.5 shrink-0" aria-hidden />}
      {children}
    </p>
  );
}

/** Under the new password: whether it's long enough, as it's typed. Grey until something
 * is typed, so an empty form doesn't open on a row of red crosses. */
export function PasswordLengthCheck({ password, minLength }: { password: string; minLength: number }) {
  if (!password) {
    return <p className="text-xs text-muted-foreground">At least {minLength} characters</p>;
  }
  return <Line ok={password.length >= minLength}>At least {minLength} characters</Line>;
}

/** Under the confirmation: whether the two match, from the first character typed. */
export function PasswordMatchCheck({ password, confirm }: { password: string; confirm: string }) {
  if (!confirm) return null;
  const ok = password === confirm;
  return (
    <div aria-live="polite">
      <Line ok={ok}>{ok ? "Passwords match" : "Passwords do not match"}</Line>
    </div>
  );
}
