import { useMemo } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { CalendarHeart, FilePlus2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/lib/api/appointments";
import type { DentalRecord } from "@/lib/api/dentalRecords";
import { manilaTodayDateStr } from "@/lib/formatDate";
import { CardHead } from "@/components/TodayCards";
import { FOLLOW_UP_DAYS, followUpsDue, recordsToWrite } from "@/lib/dentistWork";

/*
 * A dentist's own to-dos on the dashboard: consultations still waiting for their dental
 * record, and patients whose recommended next visit is close or past and not booked.
 */

const Empty = ({ text }: { text: string }) => <p className="py-14 text-center text-sm text-muted-foreground">{text}</p>;

/** Consultations done but not written up, each with a button to write its record. */
export function RecordsToWrite({ appointments, records }: { appointments: Appointment[]; records: DentalRecord[] }) {
  const list = useMemo(() => recordsToWrite(appointments, records), [appointments, records]);
  return (
    <Card className="shadow-card min-w-0">
      <CardHead icon={FilePlus2} title="Records to Write"
        extra={<span className="text-sm font-normal text-muted-foreground shrink-0">({list.length})</span>}
        link={{ to: "/dentist/records", label: "All records" }} />
      <CardContent>
        {list.length === 0 ? <Empty text="Every finished consultation has its record." /> : (
          <ul className="divide-y divide-border max-h-[260px] overflow-y-auto pr-1 -mr-1" aria-label="Records to write">
            {list.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{a.patientName}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.service} · {format(parseISO(a.date), "MMM d, yyyy")}</p>
                </div>
                <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-xs text-primary border-primary/40 shrink-0">
                  <Link to="/dentist/records" state={{ writeFor: a.id }} aria-label={`Write ${a.patientName}'s record`}>Write record</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Patients to call back: their recommended next visit is close or past and not booked. */
export function FollowUpsDue({ records, appointments }: { records: DentalRecord[]; appointments: Appointment[] }) {
  const today = manilaTodayDateStr();
  const list = useMemo(() => followUpsDue(records, appointments, today), [records, appointments, today]);
  return (
    <Card className="shadow-card min-w-0">
      <CardHead icon={CalendarHeart} title="Follow-ups Due"
        extra={<span className="text-sm font-normal text-muted-foreground shrink-0">({list.length})</span>}
        link={{ to: "/dentist/patient-history", label: "Patients" }} />
      <CardContent>
        <p className="-mt-1 mb-2 text-sm text-muted-foreground">Next visits in the next {FOLLOW_UP_DAYS} days or overdue, not booked yet.</p>
        {list.length === 0 ? <Empty text="No follow-ups due." /> : (
          <ul className="divide-y divide-border max-h-[240px] overflow-y-auto pr-1 -mr-1" aria-label="Follow-ups due">
            {list.map((r) => {
              const days = differenceInCalendarDays(parseISO(r.nextVisit!), parseISO(today));
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{r.patientName ?? "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">Last: {r.diagnosis} · {format(parseISO(r.date), "MMM d")}</p>
                  </div>
                  <span className={cn("text-xs font-medium shrink-0 tabular-nums", days < 0 ? "text-destructive" : days <= 3 ? "text-warning" : "text-foreground")}>
                    {days < 0 ? `Overdue ${-days}d` : days === 0 ? "Due today" : `Due ${format(parseISO(r.nextVisit!), "MMM d")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
