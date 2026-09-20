import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getDentistSchedule, DAY_NAMES, type DentistScheduleData } from "@/lib/api/staff";
import { toLabel, toMinutes } from "@/lib/dentistSchedules";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  Clock,
  UtensilsCrossed,
  Palmtree,
  ShieldAlert,
  Loader2,
} from "lucide-react";

function formatTimeRange(start: string, end: string) {
  return `${toLabel(toMinutes(start))} - ${toLabel(toMinutes(end))}`;
}

export default function DentistSchedule() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<DentistScheduleData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getDentistSchedule(user.id)
      .then(setSchedule)
      .catch(() => toast.error("Failed to load your schedule"))
      .finally(() => setLoading(false));
  }, [user]);

  const days = [...(schedule?.days ?? [])].sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">My Schedule</h1>
        <p className="text-muted-foreground">Your assigned clinic schedule and leave calendar</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : days.length === 0 ? (
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
                  {days.map((d) => (
                    <Badge key={d.dayOfWeek} variant="outline" className="bg-secondary text-secondary-foreground">
                      {DAY_NAMES[d.dayOfWeek]}
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
              <CardContent className="space-y-2">
                {days.map((d) => (
                  <div key={d.dayOfWeek} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{DAY_NAMES[d.dayOfWeek].slice(0, 3)}</span>
                    <span className="font-medium text-foreground">{formatTimeRange(d.start, d.end)} · {d.duration} min</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <UtensilsCrossed className="w-4 h-4 text-primary" /> Lunch Break
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {days.map((d) => (
                  <div key={d.dayOfWeek} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{DAY_NAMES[d.dayOfWeek].slice(0, 3)}</span>
                    <span className="font-medium text-foreground">
                      {d.lunchStart && d.lunchEnd ? formatTimeRange(d.lunchStart, d.lunchEnd) : "None"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="font-heading text-base flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-primary" /> Leave Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(schedule?.unavailable.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No approved leave at the moment.</p>
                ) : (
                  <ul className="space-y-2">
                    {schedule!.unavailable.map((u) => (
                      <li key={u.id} className="text-sm text-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                        {format(parseISO(u.date), "MMMM d, yyyy (EEEE)")}{u.reason ? ` — ${u.reason}` : ""}
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
