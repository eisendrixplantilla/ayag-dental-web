/** Tightens a table so its columns fit the page instead of running off the side of it.
 *
 * Two things in the shared table primitive make a wide table wider than it needs to be,
 * and neither is worth changing for every table in the app at once:
 *
 *  - `p-4` on each cell spends 32px per column on horizontal padding alone, which on a
 *    ten-column table is 320px — more than a whole column's worth.
 *  - `TableHead` sets `whitespace-nowrap`, so a heading longer than any of its values
 *    ("Assigned Dentist" over "Dr. Mike Johnson") sets that column's minimum width.
 *    Letting the headings wrap hands those columns back to their contents.
 *
 * Deliberately does NOT touch `td` whitespace. These are descendant selectors, so a
 * `[&_td]:whitespace-normal` here would outrank the `whitespace-nowrap` a page puts on
 * an individual cell, and dates and time ranges would start wrapping mid-column. A
 * page that needs its long text columns to wrap says so on those cells itself.
 */
export const COMPACT_TABLE =
  "[&_th]:px-2 [&_td]:px-2 [&_th]:whitespace-normal [&_th]:align-bottom";

/** For a cell holding free text — a name, a service, a reason — that should wrap rather
 * than hold the table open at the width of its longest line. */
export const WRAP_CELL = "whitespace-normal break-words";
