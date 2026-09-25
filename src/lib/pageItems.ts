/** The page numbers a pagination bar should show: always the first and last, the
 * current one and its neighbours, with `null` standing in for the runs left out.
 * Keeping it out of the component keeps the bar's width predictable and testable
 * without rendering anything. */
export function pageItems(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const keep = new Set([1, pageCount, page, page - 1, page + 1]);
  // Keep the bar a steady width at both ends, where one neighbour falls off.
  if (page <= 3) [2, 3, 4].forEach(n => keep.add(n));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach(n => keep.add(n));

  const items: (number | null)[] = [];
  for (let n = 1; n <= pageCount; n++) {
    if (keep.has(n)) items.push(n);
    else if (items[items.length - 1] !== null) items.push(null);
  }
  return items;
}
