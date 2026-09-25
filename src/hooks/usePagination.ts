import { useEffect, useMemo, useState } from "react";

/** How many rows every table in the system shows at once. */
export const PAGE_SIZE = 10;

/**
 * Cuts an already-filtered list down to the page being viewed.
 *
 * Pass the same list the table would otherwise map over, and render `paged` instead.
 * Everything else — the toolbar's count, the printout, any total — must keep reading
 * the full list, or it will quietly shrink to whatever page is on screen.
 *
 * `resetKey` is whatever decides the list is now a different list, normally the
 * filter: changing it puts the reader back on page 1 rather than leaving them on a
 * page that belongs to the old results.
 */
export function usePagination<T>(items: T[], resetKey?: unknown, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // A filter that narrows the list can leave the current page past the end of it.
  useEffect(() => { setPage(p => Math.min(p, pageCount)); }, [pageCount]);
  useEffect(() => { setPage(1); }, [resetKey]);

  const paged = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, setPage, paged, pageCount, total: items.length, pageSize };
}
