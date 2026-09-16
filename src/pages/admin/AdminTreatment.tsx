import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Pill, CalendarPlus, Search } from "lucide-react";
import { toast } from "sonner";

const recentTreatments = [
  { patient: "Maria Garcia", procedure: "Tooth Extraction", tooth: "#36", date: "Mar 15, 2024", dentist: "Dr. Sarah Chen" },
  { patient: "James Wilson", procedure: "Dental Cleaning", tooth: "Full", date: "Mar 15, 2024", dentist: "Dr. Sarah Chen" },
  { patient: "Emma Davis", procedure: "Root Canal", tooth: "#14", date: "Mar 15, 2024", dentist: "Dr. Mike Johnson" },
];

export default function AdminTreatment() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Treatment Recording</h1>
        <p className="text-muted-foreground">Record procedures, prescriptions, and follow-ups</p>
      </div>

      <Tabs defaultValue="record">
        <TabsList>
          <TabsTrigger value="record" className="gap-1"><ClipboardList className="w-4 h-4" /> Record Procedure</TabsTrigger>
          <TabsTrigger value="prescription" className="gap-1"><Pill className="w-4 h-4" /> Prescription</TabsTrigger>
          <TabsTrigger value="followup" className="gap-1"><CalendarPlus className="w-4 h-4" /> Follow-up</TabsTrigger>
        </TabsList>

        <TabsContent value="record">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Patient</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Search patient..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                  </div>
                </div>
                <div><Label>Procedure</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select procedure" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleaning">Dental Cleaning</SelectItem>
                      <SelectItem value="extraction">Tooth Extraction</SelectItem>
                      <SelectItem value="filling">Filling</SelectItem>
                      <SelectItem value="rootcanal">Root Canal</SelectItem>
                      <SelectItem value="whitening">Teeth Whitening</SelectItem>
                      <SelectItem value="xray">Dental X-Ray</SelectItem>
                      <SelectItem value="braces">Braces Adjustment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Tooth Number</Label><Input placeholder="e.g., #14, Full Mouth" /></div>
                <div><Label>Dentist</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select dentist" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chen">Dr. Sarah Chen</SelectItem>
                      <SelectItem value="johnson">Dr. Mike Johnson</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Notes</Label><Textarea placeholder="Treatment notes and observations..." rows={3} /></div>
              <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success("Treatment recorded successfully")}>Save Treatment Record</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prescription">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Patient</Label><Input placeholder="Search patient..." /></div>
                <div><Label>Medication</Label><Input placeholder="e.g., Amoxicillin 500mg" /></div>
                <div><Label>Dosage</Label><Input placeholder="e.g., 3x daily for 7 days" /></div>
                <div><Label>Prescribed By</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select dentist" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chen">Dr. Sarah Chen</SelectItem>
                      <SelectItem value="johnson">Dr. Mike Johnson</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Reason / Notes</Label><Textarea placeholder="Reason for prescription..." rows={2} /></div>
              <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success("Prescription saved")}>Save Prescription</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <Card className="shadow-card">
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><Label>Patient</Label><Input placeholder="Search patient..." /></div>
                <div><Label>Service</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checkup">Follow-up Check-up</SelectItem>
                      <SelectItem value="removal">Suture Removal</SelectItem>
                      <SelectItem value="adjustment">Braces Adjustment</SelectItem>
                      <SelectItem value="cleaning">Dental Cleaning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Date</Label><Input type="date" /></div>
                <div><Label>Time</Label><Input type="time" /></div>
              </div>
              <div><Label>Notes</Label><Textarea placeholder="Follow-up instructions..." rows={2} /></div>
              <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success("Follow-up appointment scheduled")}>Schedule Follow-up</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Recent Treatments</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentTreatments.map((t, i) => (
              <div key={i} className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">{t.patient}</p>
                  <p className="text-sm text-muted-foreground">{t.procedure} • Tooth {t.tooth} • {t.dentist}</p>
                </div>
                <span className="text-sm text-muted-foreground">{t.date}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
