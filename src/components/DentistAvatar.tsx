import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/workingDays";
import type { DentistProfile } from "@/lib/api/booking";

/** A dentist's photo, or their initials when there isn't one. */
export default function DentistAvatar({ d, className }: { d: Pick<DentistProfile, "name" | "photoUrl">; className?: string }) {
  return d.photoUrl ? (
    <img src={d.photoUrl} alt="" className={cn("rounded-full object-cover bg-muted shrink-0", className)} />
  ) : (
    <span aria-hidden className={cn("rounded-full gradient-primary text-primary-foreground font-semibold flex items-center justify-center shrink-0", className)}>
      {initialsOf(d.name)}
    </span>
  );
}
