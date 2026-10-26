import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** How many rows a dashboard list shows; the page it links to has the rest. */
export const DASHBOARD_LIST_SIZE = 5;

const STATUS_BADGE: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  confirmed: "bg-success/10 text-success border-success/20",
  pending: "bg-warning/10 text-warning border-warning/20",
  rescheduled: "bg-warning/10 text-warning border-warning/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

export interface TodayItem {
  id: string;
  /** When: "9:00 AM", or "Oct 28". */
  when: string;
  title: string;
  detail: string;
  status: string;
}

/**
 * A dashboard's short list (today's queue, the next visits): the first few rows, each a
 * time, a name and a line under it, and a link to the page with all of them.
 */
export default function TodayList({ title, icon: Icon, items, emptyText, link }: {
  title: string;
  icon: LucideIcon;
  items: TodayItem[];
  emptyText: string;
  link: { to: string; label: string };
}) {
  const shown = items.slice(0, DASHBOARD_LIST_SIZE);
  const more = items.length - shown.length;
  return (
    <Card className="shadow-card min-w-0">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="font-heading text-base flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" /> {title}
          {items.length > 0 && <span className="text-sm font-normal text-muted-foreground">· {items.length}</span>}
        </CardTitle>
        <Link to={link.to} className="text-sm text-primary hover:underline inline-flex items-center gap-1 shrink-0">
          {link.label} <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="w-16 shrink-0 text-sm font-medium tabular-nums text-foreground">{item.when}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <Badge variant="outline" className={cn("capitalize shrink-0", STATUS_BADGE[item.status])}>{item.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        {more > 0 && <p className="pt-2 text-xs text-muted-foreground">and {more} more</p>}
      </CardContent>
    </Card>
  );
}
