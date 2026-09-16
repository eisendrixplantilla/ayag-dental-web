import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dentistSchedules, type DentistSchedule, toLabel, toMinutes } from "@/lib/dentistSchedules";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Clock,
  UtensilsCrossed,
  Palmtree,
  ShieldAlert,
} from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTimeRange(start: string, end: string) {
  return `${toLabel(toMinutes(start))} - ${toLabel(toMinutes(end))}`;
}

export default function DentistSchedule() {
  const { user } = useAuth();

  const schedule: DentistSchedule | undefined = useMemo(() => {
    if (!user) return undefined;
    return dentistSchedules.find(s => s.id === user.id) ?? dentistSchedules.find(s => s.name === user.name);
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Schedule</h1>
        <p className="text-muted-foreground">Your assigned clinic schedule and leave calendar</p>
      </div>

      {!schedule ? (
        <Card className="shadow-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            No schedule found for your account. Please contact the Super Admin.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-l-4 border-l-primary shadow-card">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm text-foreground">View-only schedule</p>
                  <p className="text-xs text-muted-foreground">
                    Only the Super Admin can update your working days, hours, lunch break, or leave schedule.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" /> Working Days
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {schedule.workingDays.map((d) => (
                    <Badge key={d} variant="outline" className="bg-secondary text-secondary-foreground">
                      {DAYS[d]}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" /> Working Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground font-medium">{formatTimeRange(schedule.start, schedule.end)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Appointment duration: {schedule.duration} minutes
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-primary" /> Lunch Break
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground font-medium">
                  {formatTimeRange(schedule.lunchStart, schedule.lunchEnd)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">No appointments are scheduled during this time.</p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-primary" /> Leave Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {schedule.leave.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No approved leave at the moment.</p>
                ) : (
                  <ul className="space-y-2">
                    {schedule.leave.map((date) => (
                      <li key={date} className="text-sm text-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                        {format(parseISO(date), "MMMM d, yyyy (EEEE)")}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
