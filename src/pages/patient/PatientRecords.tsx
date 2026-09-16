import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Pill, History } from "lucide-react";

const visitHistory = [
  { date: "Feb 10, 2024", service: "Filling", dentist: "Dr. Sarah Chen", notes: "Composite filling on tooth #14. No complications.", tooth: "#14" },
  { date: "Jan 15, 2024", service: "Tooth Extraction", dentist: "Dr. Mike Johnson", notes: "Wisdom tooth extraction (lower right). Post-op care instructions given.", tooth: "#48" },
  { date: "Dec 5, 2023", service: "Dental Cleaning", dentist: "Dr. Sarah Chen", notes: "Routine cleaning. Minor plaque buildup. Recommended flossing daily.", tooth: "Full" },
  { date: "Oct 20, 2023", service: "Check-up", dentist: "Dr. Sarah Chen", notes: "General check-up. All clear. Next visit in 3 months.", tooth: "Full" },
];

const procedures = [
  { date: "Feb 10, 2024", procedure: "Composite Filling", tooth: "#14", dentist: "Dr. Sarah Chen", status: "completed" },
  { date: "Jan 15, 2024", procedure: "Wisdom Tooth Extraction", tooth: "#48", dentist: "Dr. Mike Johnson", status: "completed" },
  { date: "Dec 5, 2023", procedure: "Prophylaxis (Cleaning)", tooth: "Full Mouth", dentist: "Dr. Sarah Chen", status: "completed" },
  { date: "Sep 15, 2023", procedure: "Dental X-Ray", tooth: "Panoramic", dentist: "Dr. Sarah Chen", status: "completed" },
];

const prescriptions = [
  { date: "Jan 15, 2024", medication: "Amoxicillin 500mg", dosage: "3x daily for 7 days", prescribedBy: "Dr. Mike Johnson", reason: "Post-extraction antibiotic" },
  { date: "Jan 15, 2024", medication: "Mefenamic Acid 500mg", dosage: "3x daily as needed for pain", prescribedBy: "Dr. Mike Johnson", reason: "Pain management" },
  { date: "Oct 20, 2023", medication: "Sensodyne Toothpaste", dosage: "Use daily", prescribedBy: "Dr. Sarah Chen", reason: "Tooth sensitivity" },
];

export default function PatientRecords() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Dental Records</h1>
        <p className="text-muted-foreground">Your complete dental history and records</p>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-6">
          <Tabs defaultValue="visits">
            <TabsList className="mb-4">
              <TabsTrigger value="visits" className="gap-1"><History className="w-4 h-4" /> Visit History</TabsTrigger>
              <TabsTrigger value="procedures" className="gap-1"><FileText className="w-4 h-4" /> Procedures</TabsTrigger>
              <TabsTrigger value="prescriptions" className="gap-1"><Pill className="w-4 h-4" /> Prescriptions</TabsTrigger>
            </TabsList>

            <TabsContent value="visits">
              <div className="space-y-4">
                {visitHistory.map((record, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground">{record.service}</p>
                        <Badge variant="outline" className="bg-secondary text-secondary-foreground">Tooth {record.tooth}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{record.date} • {record.dentist}</p>
                      <p className="text-sm text-muted-foreground mt-2">{record.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="procedures">
              <div className="space-y-3">
                {procedures.map((proc, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground">{proc.procedure}</p>
                      <p className="text-sm text-muted-foreground">{proc.date} • {proc.dentist} • Tooth {proc.tooth}</p>
                    </div>
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20">{proc.status}</Badge>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="prescriptions">
              <div className="space-y-4">
                {prescriptions.map((rx, i) => (
                  <div key={i} className="p-4 rounded-lg bg-muted/50">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">{rx.medication}</p>
                        <p className="text-sm text-muted-foreground">{rx.dosage}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{rx.date}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">Reason: {rx.reason} • Prescribed by {rx.prescribedBy}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
