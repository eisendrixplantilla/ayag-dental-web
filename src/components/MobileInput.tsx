import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatMobile, mobileIncomplete, mobileProblem, PH_MOBILE_LENGTH } from "@/lib/inputRules";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  /** Hide the "8 of 11 digits" line, for a form that shows its own errors. */
  hideHint?: boolean;
};

/** A Philippine mobile number box: only digits go in, it stops at 11, and a pasted
 * +63 number turns into 09…. Under it, a short note says what's still missing. */
const MobileInput = forwardRef<HTMLInputElement, Props>(({ value, onValueChange, hideHint, className, id, ...props }, ref) => {
  const problem = mobileProblem(value);
  // Still being typed and right so far: a quiet count, not a red error.
  const wrong = Boolean(problem) && !mobileIncomplete(value);
  const hintId = id ? `${id}-hint` : undefined;
  return (
    <div className="space-y-1">
      <Input
        ref={ref}
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        placeholder="09171234567"
        maxLength={PH_MOBILE_LENGTH + 6 /* room for a pasted "+63 " before it's cleaned */}
        value={value}
        onChange={(e) => onValueChange(formatMobile(e.target.value))}
        aria-invalid={wrong ? true : undefined}
        aria-describedby={!hideHint && problem ? hintId : undefined}
        className={cn(wrong && "border-destructive focus-visible:ring-destructive", className)}
        {...props}
      />
      {!hideHint && problem && (
        <p id={hintId} className={cn("text-xs", wrong ? "text-destructive" : "text-muted-foreground")}>{problem}</p>
      )}
    </div>
  );
});
MobileInput.displayName = "MobileInput";

export default MobileInput;
