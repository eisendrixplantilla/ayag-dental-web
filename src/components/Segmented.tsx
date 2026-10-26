import { cn } from "@/lib/utils";

/**
 * A row of mutually exclusive choices in one frame (All / Dentists / Admins): the chosen
 * one is a green pill sitting evenly inside the frame, its corners following the frame's.
 * Every such switch in the app uses this, so they all look alike.
 */
export default function Segmented<T extends string | boolean>({ value, onChange, options, label, size = "default", className }: {
  value: T;
  // The type comes from `value` alone, so a state setter fits as onChange.
  onChange: (value: NoInfer<T>) => void;
  options: readonly { value: NoInfer<T>; label: React.ReactNode }[];
  /** What is being chosen, for screen readers. */
  label: string;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border bg-card p-1",
        size === "sm" ? "h-8 text-xs" : "h-9 text-sm",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-[6px] font-medium transition-colors whitespace-nowrap",
            size === "sm" ? "px-2.5" : "px-3",
            value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
