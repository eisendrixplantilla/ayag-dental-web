import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortHeadProps } from "@/hooks/useTableSort";
import Hint from "@/components/Hint";

/** A column heading that sorts the table when clicked (see useTableSort). */
export default function SortableHead({
  sorted, description, onSort, className, children,
}: SortHeadProps & { className?: string; children: ReactNode }) {
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead
      className={className}
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
    >
      <Hint label={description ? `Sorted: ${description}. Click to change.` : "Click to sort"}>
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1 -mx-1 px-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            sorted && "text-foreground",
          )}
        >
          {children}
          <Icon className={cn("w-3.5 h-3.5 shrink-0 print:hidden", !sorted && "opacity-40")} aria-hidden />
          {description && <span className="sr-only">, sorted {description.toLowerCase()}</span>}
        </button>
      </Hint>
    </TableHead>
  );
}
