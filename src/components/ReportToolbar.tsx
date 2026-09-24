import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import TableToolbar from "@/components/TableToolbar";
import type { ReportFilter } from "@/lib/reportFilter";

interface Props {
  /** The generated report's own column headings — what can be filtered by. */
  columns: string[];
  rows: string[][];
  filter: ReportFilter;
  onChange: (filter: ReportFilter) => void;
  shown: number;
  onPrint: () => void;
}

/** The filter, the record count and Print, above a generated report — the same bar every
 * table in the system uses, with Print Report as its action. */
export default function ReportToolbar({ columns, rows, filter, onChange, shown, onPrint }: Props) {
  return (
    <TableToolbar
      columns={columns}
      rows={rows}
      filter={filter}
      onChange={onChange}
      shown={shown}
      searchLabel="Filter the generated report"
      actions={
        <Button onClick={onPrint}>
          <Printer className="w-4 h-4 mr-2" /> Print Report
        </Button>
      }
    />
  );
}
