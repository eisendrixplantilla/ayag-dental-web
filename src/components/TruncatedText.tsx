import { useEffect, useRef, useState, type ReactNode } from "react";
import Hint from "@/components/Hint";
import { cn } from "@/lib/utils";

/**
 * Text kept to one line, ending in "…" when the space runs out. Then, or when there's
 * `more` to say (e.g. a note), it gets the site's tooltip with the whole of it; a short
 * text that fits isn't given a hint repeating what's already on screen.
 */
export default function TruncatedText({ text, more, className }: { text: string; more?: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCut(el.scrollWidth > el.clientWidth + 1);
    measure();
    // The space changes with the screen (and the sidebar), not only with the text.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
    // Gaining or losing the tooltip puts a new element on the page, so measure that one.
  }, [text, cut]);

  const label = cut || more ? (
    <span className="block whitespace-normal [overflow-wrap:anywhere]">
      {text}
      {more && <span className="block text-muted-foreground">{more}</span>}
    </span>
  ) : undefined;

  return (
    <Hint label={label}>
      <span
        ref={ref}
        tabIndex={label ? 0 : undefined}
        className={cn("block truncate", label && "cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        {text}
      </span>
    </Hint>
  );
}
