import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import DentistCards from "@/components/DentistCards";

interface Props {
  /** The chosen dentist's name, or "" for none yet. */
  value: string;
  placeholder: string;
  disabled?: boolean;
  /** The services already chosen, if any, so the cards can show each dentist's next free day. */
  services: string[];
  visitMinutes?: number;
  selectedId?: string;
  onChoose: (dentistId: string) => void;
  label?: string;
  /** Whose latest dentist to mark as Recent: a patient's id, or "self" for the signed-in patient. */
  recentFor?: string;
  /** How far ahead of now a time today has to be, for patients booking themselves. */
  leadMinutes?: number;
}

/**
 * Where a booking's dentist is chosen: looks like the other pickers on the form, but opens
 * every dentist side by side — what each offers, on which days and how many a day — so
 * their availability is checked before anything else is picked.
 */
export default function DentistPicker({
  value, placeholder, disabled, services, visitMinutes, selectedId, onChoose, label = "Choose a dentist", recentFor, leadMinutes,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-11 sm:h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm",
          "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </button>
      <DentistCards
        open={open}
        onOpenChange={setOpen}
        services={services}
        visitMinutes={visitMinutes}
        selectedId={selectedId}
        onChoose={onChoose}
        recentFor={recentFor}
        leadMinutes={leadMinutes}
      />
    </>
  );
}
