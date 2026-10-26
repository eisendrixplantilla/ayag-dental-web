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
  "[&_th]:px-2 [&_td]:px-2 [&_th]:whitespace-normal [&_th]:align-bottom " +
  // On a phone a table never fits, so rather than squeezing every column until a name
  // stacks five words tall, each cell keeps to one line and the table swipes sideways
  // in its box. Here the descendant selector outranking a cell's own WRAP_CELL is the
  // point: on a phone it wins, from md up the cell's own wrapping applies again.
  "max-md:[&_td]:whitespace-nowrap max-md:[&_th]:whitespace-nowrap " +
  // A row's action buttons (View, Deactivate...) side by side rather than stacked, and
  // less padding above and below, so a row is one line tall, not three.
  "max-md:[&_td_.flex-wrap]:flex-nowrap max-md:[&_td]:py-2";

/** The column that says whose row it is (a patient's name, a staff member, an item).
 * Put it on that column's heading and cells: on a phone it stays pinned at the left
 * while the rest of the row swipes past, so the reader never loses track of the row.
 * It is the one column allowed to wrap there, and only up to about two-fifths of the
 * screen, so it can't crowd out what it is pinned beside. At every size it keeps a
 * minimum width, so a long email beside it can't squeeze a name to one word a line. It
 * reads left even when it isn't the first column. */
export const PIN_COL =
  // Reads left, like any text column.
  "text-left [&>*]:mx-0 [&>.flex]:justify-start " +
  "min-w-[7.5rem] max-md:sticky max-md:left-0 max-md:z-10 max-md:bg-card max-md:!whitespace-normal " +
  "max-md:max-w-[40vw] max-md:shadow-[inset_-1px_0_0_hsl(var(--border))]";

/** For a cell holding free text — a name, a service, a reason — that should wrap rather
 * than hold the table open at the width of its longest line. */
export const WRAP_CELL = "whitespace-normal break-words";

/**
 * The clinic's alignment rules for a table column, on its heading and every cell:
 *  - text (names, services, notes, emails): left, the default; nothing to add.
 *  - numbers (counts, money, ages, quantities): NUM_COL, right, so the digits line up.
 *  - short codes, dates, times and statuses (IDs, "Yes"/"No", "Pending"), and the row's
 *    action buttons: CODE_COL, centered.
 * Block contents (badges, button rows, inputs) move with the text.
 */
export const NUM_COL = "!text-right [&>*]:ml-auto [&>.flex]:justify-end";
export const CODE_COL = "!text-center [&>*]:mx-auto [&>.flex]:justify-center";

/** Which of the rules a column follows, from its heading: for tables whose columns are
 * listed as data (the generated reports, the printed documents). */
export function columnKind(column: string): "text" | "number" | "code" {
  if (/^(Age|Quantity|Qty|Min Stock|Stock|Price|Amount|Subtotal|Total.*|.*Count|Patients|Appointments)$/i.test(column)) return "number";
  if (/(\bID\b|Reference|Date|Dates|Time|Booked On|Requested|Registered|Status|Type|Walk-in|Account|^Day$|Phone|Contact Number|Tooth No|Hours|Lunch Break|Latest Consultation|Leave For|Role|Slot)/i.test(column)) return "code";
  return "text";
}
/** columnKind as the class to put on that column's heading and cells. */
export const alignFor = (column: string) => ({ number: NUM_COL, code: CODE_COL, text: "" })[columnKind(column)];
