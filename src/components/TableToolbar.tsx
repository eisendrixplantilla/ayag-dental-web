import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

/** The filter row above a table: small grey labels over compact controls, with how many
 * records are showing and the page's own actions kept together on the right.
 *
 * Every list in the system uses this, so a filter bar looks the same whichever page it
 * is on — the shape the generated reports already had. */

interface FieldProps {
  label: string;
  /** Defaults to a narrow column; widen it for a search box or a date pair. */
  className?: string;
  children: ReactNode;
}

export function FilterField({ label, className = "w-full sm:w-44", children }: FieldProps) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

interface SearchProps {
  label?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function FilterSearch({ label = "Search", placeholder, value, onChange, className = "w-full sm:w-64" }: SearchProps) {
  return (
    <FilterField label={label} className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </FilterField>
  );
}

/** From/To, either end optional, each bounding the other. */
interface RangeProps {
  label?: string;
  from: string;
  to: string;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
}

export function FilterRange({ label = "Date range", from, to, onFrom, onTo }: RangeProps) {
  return (
    <FilterField label={label} className="w-full sm:w-auto">
      <div className="flex items-center gap-2">
        <Input
          type="date"
          aria-label="From date"
          className="sm:w-40"
          max={to || undefined}
          value={from}
          onChange={(e) => onFrom(e.target.value)}
        />
        <span className="text-sm text-muted-foreground shrink-0">to</span>
        <Input
          type="date"
          aria-label="To date"
          className="sm:w-40"
          min={from || undefined}
          value={to}
          onChange={(e) => onTo(e.target.value)}
        />
      </div>
    </FilterField>
  );
}

interface Props {
  /** The filter fields, left to right. */
  children?: ReactNode;
  /** Passed only while something is filtered, which is when Clear appears. */
  onClear?: () => void;
  /** How many rows are showing. */
  count: number;
  /** How many there are in total; shown as "7 of 36" once they differ. */
  total?: number;
  /** What the rows are, e.g. "appointment(s)". */
  noun?: string;
  /** The page's buttons — Print, Add, and so on. */
  actions?: ReactNode;
}

export default function TableToolbar({ children, onClear, count, total, noun = "record(s)", actions }: Props) {
  const narrowed = total !== undefined && count !== total;

  return (
    <div className="flex items-end justify-between gap-3 flex-wrap print:hidden">
      <div className="flex items-end gap-2 flex-wrap">
        {children}
        {onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>Clear filters</Button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="whitespace-nowrap">
          {narrowed ? `${count} of ${total} ${noun}` : `${count} ${noun}`}
        </Badge>
        {actions}
      </div>
    </div>
  );
}
