import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageItems } from "@/lib/pageItems";

/** The page bar under a long list.
 *
 * It says which rows are on screen out of how many, and offers the page numbers. Pages
 * far from the current one collapse into an ellipsis so the bar can't outgrow a phone.
 *
 * Nothing renders when everything already fits on one page — a lone "1" is noise.
 *
 * Note for callers: paginate only what's on screen. A printout, a report or a total
 * should keep reading the whole filtered list, not the page being viewed. */

interface Props {
  /** 1-based. */
  page: number;
  onPageChange: (page: number) => void;
  /** How many rows there are after filtering, across every page. */
  total: number;
  pageSize: number;
  /** What the rows are, e.g. "appointment(s)". */
  noun?: string;
}

export default function TablePagination({ page, onPageChange, total, pageSize, noun = "row(s)" }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const items = useMemo(() => pageItems(page, pageCount), [page, pageCount]);
  if (pageCount <= 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 print:hidden">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {first}–{last} of {total} {noun}
      </p>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline ml-1">Previous</span>
        </Button>
        {items.map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground select-none" aria-hidden="true">…</span>
          ) : (
            <Button
              key={n}
              variant={n === page ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9"
              onClick={() => onPageChange(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
            >
              {n}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === pageCount}
          aria-label="Next page"
        >
          <span className="hidden sm:inline mr-1">Next</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </nav>
    </div>
  );
}
