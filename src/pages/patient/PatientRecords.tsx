import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Pill, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";

export default function PatientRecords() {
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDentalRecords()
      .then(setRecords)
      .catch(() => toast.error("Failed to load dental records"))
      .finally(() => setLoading(false));
  }, []);

  const procedures = useMemo(
    () =>
      records.flatMap((r) =>
        r.treatments.map((t) => ({
          date: r.date,
          procedure: t.serviceName ?? "—",
          tooth: r.toothNumber ?? "Full",
          dentist: r.dentistName ?? "—",
          status: "completed",
        })),
      ),
    [records],
  );

  const prescriptions = useMemo(
    () =>
      records.flatMap((r) =>
        r.prescriptions.map((p) => ({
          date: r.date,
          medication: p.medicine,
          dosage: p.dosage ?? "As directed",
          prescribedBy: r.dentistName ?? "—",
          reason: p.instructions ?? r.diagnosis,
        })),
      ),
    [records],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Dental Records</h1>
        <p className="text-muted-foreground">Your complete dental history and records</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Tabs defaultValue="visits">
            <TabsList className="mb-4">
              <TabsTrigger value="visits" className="gap-1"><History className="w-4 h-4" /> Visit History</TabsTrigger>
              <TabsTrigger value="procedures" className="gap-1"><FileText className="w-4 h-4" /> Procedures</TabsTrigger>
              <TabsTrigger value="prescriptions" className="gap-1"><Pill className="w-4 h-4" /> Prescriptions</TabsTrigger>
            </TabsList>

            <TabsContent value="visits">
              <div className="space-y-4">
                {records.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No dental records yet.</p>
                )}
                {records.map((record) => (
                  <div key={record.id} className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground">
                          {record.treatments.map((t) => t.serviceName).filter(Boolean).join(", ") || record.diagnosis}
                        </p>
                        <Badge variant="outline" className="bg-secondary text-secondary-foreground">
                          Tooth {record.toothNumber ?? "Full"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(record.date), "PPP")} • {record.dentistName ?? "—"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">{record.treatmentNotes || record.diagnosis}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="procedures">
              <div className="space-y-3">
                {procedures.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No procedures on record.</p>
                )}
                {procedures.map((proc, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground">{proc.procedure}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(proc.date), "PPP")} • {proc.dentist} • Tooth {proc.tooth}
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20">{proc.status}</Badge>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="prescriptions">
              <div className="space-y-4">
                {prescriptions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No prescriptions on record.</p>
                )}
                {prescriptions.map((rx, i) => (
                  <div key={i} className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{rx.medication}</p>
                        <p className="text-sm text-muted-foreground">{rx.dosage}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{format(parseISO(rx.date), "PPP")}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">Reason: {rx.reason} • Prescribed by {rx.prescribedBy}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
