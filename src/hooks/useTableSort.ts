import { useCallback, useMemo, useRef, useState } from "react";
import { columnKind, describeSort, nextSort, sortByColumn, type TableSort } from "@/lib/tableSort";

/** Click-to-sort for a table. Pass the (already filtered) items and how to read an
 * item's text row; render `sorted`, and give each heading `headProps(column)`.
 *
 * Put this before pagination and printing, so the page being viewed and the printed
 * document come out in the order the reader chose. */
export function useTableSort<T>(items: T[], rowOf: (item: T) => string[]) {
  const [sort, setSort] = useState<TableSort | null>(null);
  // Pages pass an inline arrow; reading it through a ref keeps `sorted` stable.
  const rowOfRef = useRef(rowOf);
  rowOfRef.current = rowOf;

  const sorted = useMemo(() => sortByColumn(items, (i) => rowOfRef.current(i), sort), [items, sort]);

  const kindOf = useCallback(
    (col: number) => columnKind(items.map((i) => rowOfRef.current(i)[col])),
    [items],
  );

  const headProps = (col: number) => ({
    sorted: sort?.col === col ? sort.dir : null,
    description: sort?.col === col ? describeSort(kindOf(col), sort.dir) : null,
    onSort: () => setSort((cur) => nextSort(cur, col, kindOf(col))),
  });

  /** Changes whenever the order does, for sending the reader back to page 1. */
  const sortKey = sort ? `${sort.col}:${sort.dir}` : "";

  /** Back to the table's own order, e.g. when it now holds a different report. */
  const clearSort = useCallback(() => setSort(null), []);

  return { sorted, sort, sortKey, headProps, clearSort };
}

export type SortHeadProps = ReturnType<ReturnType<typeof useTableSort>["headProps"]>;
