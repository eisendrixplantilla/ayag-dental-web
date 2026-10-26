import { useState } from "react";
import { cn } from "@/lib/utils";
import Hint from "@/components/Hint";

/** An email address in a table, cut short with "…" so one long address can't widen its
 * column and squeeze everything beside it. Hovering shows the whole address, and a tap or
 * click opens it out in place (touch screens have no hover); another tap shuts it again.
 * Search, sorting and printing still use the full address: only the screen shortens it. */
export default function CollapsedEmail({ email, className }: { email: string | null | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!email || email === "—") return <span className="text-muted-foreground">—</span>;

  return (
    <Hint label={open ? undefined : email}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? `${email}, tap to shorten` : `${email}, tap to show in full`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "block [text-align:inherit] max-w-[9rem] sm:max-w-[11rem] lg:max-w-[14rem] rounded-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open ? "whitespace-normal break-all" : "truncate",
          className,
        )}
      >
        {email}
      </button>
    </Hint>
  );
}
