import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Search } from "lucide-react";

/** Above that many distinct entries a dropdown stops being useful, so the field is
 * searched by typing instead. */
const MAX_CHOICES = 15;

export const ALL_FIELDS = "all";

interface Props {
  /** The generated report's own column headings — what can be filtered by. */
  columns: string[];
  rows: string[][];
  /** ALL_FIELDS, or the index of the column being filtered. */
  field: string;
  onFieldChange: (field: string) => void;
  value: string;
  onValueChange: (value: string) => void;
  shown: number;
  onPrint: () => void;
}

/** The filter, the record count and Print, above a generated report.
 *
 * A field with a handful of distinct entries — a status, a dentist — is picked from a
 * list, so filtering by it takes one click and can't be mistyped. Anything with too
 * many (a name, a reference) is typed instead. */
export default function ReportToolbar({
  columns, rows, field, onFieldChange, value, onValueChange, shown, onPrint,
}: Props) {
  const choices = useMemo(() => {
    if (field === ALL_FIELDS) return null;
    const col = Number(field);
    const distinct = Array.from(new Set(rows.map((r) => r[col]).filter(Boolean))).sort();
    return distinct.length > 0 && distinct.length <= MAX_CHOICES ? distinct : null;
  }, [rows, field]);

  const fieldName = field === ALL_FIELDS ? "" : columns[Number(field)];

  return (
    <div className="flex items-end justify-between gap-3 flex-wrap print:hidden">
      <div className="flex items-end gap-2 flex-wrap">
        <div className="w-full sm:w-44">
          <Label className="text-xs text-muted-foreground">Filter by</Label>
          {/* Changing the field clears what was typed for the old one, so the table
              can't silently empty out. */}
          <Select value={field} onValueChange={(f) => { onFieldChange(f); onValueChange(""); }}>
            <SelectTrigger aria-label="Filter by field"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value={ALL_FIELDS}>All fields</SelectItem>
              {columns.map((c, i) => (
                <SelectItem key={c} value={String(i)}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-64">
          <Label className="text-xs text-muted-foreground">
            {fieldName ? `${fieldName} is` : "Containing"}
          </Label>
          {choices ? (
            <Select value={value || ALL_FIELDS} onValueChange={(v) => onValueChange(v === ALL_FIELDS ? "" : v)}>
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
                aria-label="Filter the generated report"
                placeholder={fieldName ? `Search ${fieldName.toLowerCase()}...` : "Filter these results..."}
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
              />
            </div>
          )}
        </div>

        {value.trim() && (
          <Button variant="ghost" size="sm" onClick={() => onValueChange("")}>Clear filter</Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          {value.trim() ? `${shown} of ${rows.length} record(s)` : `${rows.length} record(s)`}
        </Badge>
        <Button onClick={onPrint}>
          <Printer className="w-4 h-4 mr-2" /> Print Report
        </Button>
      </div>
    </div>
  );
}
