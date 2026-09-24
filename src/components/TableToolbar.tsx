import { useMemo, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { ALL_FIELDS, EMPTY_FILTER, filterIsActive, isDateColumn, type ReportFilter } from "@/lib/reportFilter";

/** The filter bar above a table, and the one the generated reports use.
 *
 * Pick a column to filter by, then say what to look for: a column of dates asks for a
 * range, a column with a handful of distinct entries offers them in a list, anything
 * else is typed. "All fields" searches the row. The count of what is showing and the
 * page's own buttons sit together on the right.
 *
 * A page passes the same text rows it would print, so what filters the table and what
 * lands on the printed document can't drift apart. */

/** Above that many distinct entries a dropdown stops being useful, so the field is
 * searched by typing instead. */
const MAX_CHOICES = 15;

interface Props {
  /** The table's column headings — what can be filtered by. */
  columns: string[];
  /** One text row per item, in the same order as the items themselves. */
  rows: string[][];
  filter: ReportFilter;
  onChange: (filter: ReportFilter) => void;
  /** How many rows are left after filtering. */
  shown: number;
  /** What the rows are, e.g. "appointment(s)". */
  noun?: string;
  /** The page's own buttons — Print, Add, and so on. */
  actions?: ReactNode;
  /** What the free-text box is called to a screen reader. */
  searchLabel?: string;
  /** Choices to offer for a column whose cells hold a list, e.g. a visit of two
   * services: without this the dropdown would offer "Oral, Veeners" as its own entry. */
  columnChoices?: Record<number, string[]>;
}

export default function TableToolbar({
  columns, rows, filter, onChange, shown, noun = "record(s)", actions,
  searchLabel = "Filter these results", columnChoices,
}: Props) {
  const col = filter.field === ALL_FIELDS ? -1 : Number(filter.field);
  const fieldName = col < 0 ? "" : columns[col];
  const isDates = useMemo(() => col >= 0 && isDateColumn(rows, col), [rows, col]);

  const choices = useMemo(() => {
    if (col < 0 || isDates) return null;
    const given = columnChoices?.[col];
    const distinct = given ?? Array.from(new Set(rows.map((r) => r[col]).filter(Boolean))).sort();
    return distinct.length > 0 && distinct.length <= MAX_CHOICES ? distinct : null;
  }, [rows, col, isDates, columnChoices]);

  // Changing the field clears what was set for the old one, so the table can't
  // silently empty out.
  const pickField = (field: string) => onChange({ ...EMPTY_FILTER, field });
  const setValue = (value: string) => onChange({ ...filter, value, from: "", to: "" });
  const setRange = (part: Partial<ReportFilter>) => onChange({ ...filter, value: "", ...part });

  return (
    <div className="flex items-end justify-between gap-3 flex-wrap print:hidden">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-full sm:w-44">
          <Label className="text-xs text-muted-foreground">Filter by</Label>
          <Select value={filter.field} onValueChange={pickField}>
            <SelectTrigger aria-label="Filter by field"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value={ALL_FIELDS}>All fields</SelectItem>
              {columns.map((c, i) => (
                <SelectItem key={c} value={String(i)}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isDates ? (
          <div className="w-full sm:w-auto">
            <Label className="text-xs text-muted-foreground">{fieldName} between</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                aria-label="From date"
                className="sm:w-40"
                max={filter.to || undefined}
                value={filter.from}
                onChange={(e) => setRange({ from: e.target.value })}
              />
              <span className="text-sm text-muted-foreground shrink-0">to</span>
              <Input
                type="date"
                aria-label="To date"
                className="sm:w-40"
                min={filter.from || undefined}
                value={filter.to}
                onChange={(e) => setRange({ to: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="w-full sm:w-64">
            <Label className="text-xs text-muted-foreground">
              {fieldName ? `${fieldName} is` : "Containing"}
            </Label>
            {choices ? (
              <Select value={filter.value || ALL_FIELDS} onValueChange={(v) => setValue(v === ALL_FIELDS ? "" : v)}>
                <SelectTrigger aria-label={`Filter by ${fieldName}`}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value={ALL_FIELDS}>{`Any ${fieldName.toLowerCase()}`}</SelectItem>
                  {choices.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  aria-label={searchLabel}
                  placeholder={fieldName ? `Search ${fieldName.toLowerCase()}...` : "Filter these results..."}
                  value={filter.value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {filterIsActive(filter) && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ ...EMPTY_FILTER, field: filter.field })}>
            Clear filter
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="whitespace-nowrap">
          {filterIsActive(filter) ? `${shown} of ${rows.length} ${noun}` : `${rows.length} ${noun}`}
        </Badge>
        {actions}
      </div>
    </div>
  );
}
