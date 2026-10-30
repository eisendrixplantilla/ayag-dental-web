import type { ReactElement, ReactNode } from "react";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  /** What the tooltip says; nothing shows when it's empty. */
  label: ReactNode;
  /** One element that takes a ref (a Button, Link, or plain tag), which the tooltip points at. */
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * The site's one tooltip: the white box the dentist cards and dental chart use, in place of
 * the browser's own `title` box (slow, plain, never on phones). It shows on hover and on
 * keyboard focus, and is drawn over the page so a dialog or a drawing can't hide it.
 */
export default function Hint({ label, children, side }: Props) {
  if (label === undefined || label === null || label === "" || label === false) return children;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipPortal>
          {/* Above an open picker or menu too (those sit at z-60). */}
          <TooltipContent side={side} className="z-[70] max-w-xs text-xs">{label}</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
