import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Pill, History, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { formatManilaDate } from "@/lib/formatDate";
import { usePrintDocument } from "@/hooks/usePrintDocument";

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

  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "My Dental Records",
      tables: [
        {
          heading: "Visit History",
          columns: ["Date", "Procedures", "Tooth", "Dentist", "Notes"],
          rows: records.map(r => [
            format(parseISO(r.date), "MMM d, yyyy"),
            r.treatments.map(t => t.serviceName).filter(Boolean).join(", ") || "—",
            r.toothNumber ?? "Full",
            r.dentistName ?? "—",
            r.treatmentNotes || r.diagnosis,
          ]),
          emptyText: "No dental records yet.",
        },
        {
          heading: "Procedures",
          columns: ["Date", "Procedure", "Tooth", "Dentist"],
          rows: procedures.map(p => [
            format(parseISO(p.date), "MMM d, yyyy"), p.procedure, p.tooth, p.dentist,
          ]),
          emptyText: "No procedures on record.",
        },
        {
          heading: "Prescriptions",
          columns: ["Date", "Medication", "Dosage", "Prescribed By", "Instructions"],
          rows: prescriptions.map(p => [
            format(parseISO(p.date), "MMM d, yyyy"), p.medication, p.dosage, p.prescribedBy, p.reason,
          ]),
          emptyText: "No prescriptions on record.",
        },
      ],
    });

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Dental Records · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Dental Records</h1>
          <p className="text-muted-foreground">Your complete dental history and records</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-6">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
          <Tabs defaultValue="visits">
            <TabsList className="mb-4 print:hidden">
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
