import type { ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Hint from "@/components/Hint";
import { cn } from "@/lib/utils";

/*
 * How every table's Actions column looks, so the tables stay compact: one or two actions
 * are icons, each named by its tooltip; with more, the first is an icon and the rest sit
 * behind ▾.
 */

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** Red, for actions that cancel, remove or delete. */
  danger?: boolean;
}

/** A row's actions, side by side in the middle of the cell. */
export function RowActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-center gap-1", className)}>{children}</div>;
}

/** One action as an icon; the tooltip says what it does. */
export function IconAction({
  label, icon: Icon, onClick, ariaLabel, className, disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  /** A fuller name for screen readers, e.g. "Edit Maria Santos". */
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Hint label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-8 w-8", className)}
        aria-label={ariaLabel ?? label}
        onClick={onClick}
        disabled={disabled}
      >
        <Icon className="w-4 h-4" />
      </Button>
    </Hint>
  );
}

/** The rest of a row's actions, behind ▾. Keeps its width when there's nothing to offer,
 * so the icons beside it stay lined up from row to row. */
export function MoreActions({ actions, label = "More options" }: { actions: RowAction[]; label?: string }) {
  if (actions.length === 0) return <div className="h-8 w-8" aria-hidden="true" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={label}>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        {actions.map((a) => (
          <DropdownMenuItem
            key={a.label}
            onClick={a.onClick}
            className={a.danger ? "text-destructive focus:text-destructive" : undefined}
          >
            <a.icon className="w-4 h-4 mr-2" /> {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
