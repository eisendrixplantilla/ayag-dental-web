import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Clock, Stethoscope, DollarSign } from "lucide-react";
import { toast } from "sonner";

const clinicHours = [
  { day: "Monday", open: "08:00", close: "17:00", enabled: true },
  { day: "Tuesday", open: "08:00", close: "17:00", enabled: true },
  { day: "Wednesday", open: "08:00", close: "17:00", enabled: true },
  { day: "Thursday", open: "08:00", close: "17:00", enabled: true },
  { day: "Friday", open: "08:00", close: "17:00", enabled: true },
  { day: "Saturday", open: "09:00", close: "14:00", enabled: true },
  { day: "Sunday", open: "", close: "", enabled: false },
];

const services = [
  { name: "Orthodontics (Braces)", duration: "60 min", price: 25000 },
  { name: "EXO (Bunot)", duration: "45 min", price: 3000 },
  { name: "Restoration", duration: "30 min", price: 2500 },
  { name: "Oral", duration: "30 min", price: 1500 },
  { name: "Venners", duration: "60 min", price: 15000 },
  { name: "Denture (Pustiso)", duration: "60 min", price: 12000 },
  { name: "Implant", duration: "90 min", price: 35000 },
  { name: "Surgery", duration: "90 min", price: 20000 },
  { name: "TMJ", duration: "45 min", price: 5000 },
  { name: "Root Canal", duration: "90 min", price: 8000 },
  { name: "Teeth Whitening", duration: "60 min", price: 5000 },
  { name: "Fixed Bridge", duration: "60 min", price: 18000 },
];

export default function SuperAdminSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">System Settings</h1>
        <p className="text-muted-foreground">Configure clinic hours, services, and pricing</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Clinic Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {clinicHours.map((h, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                <p className="w-24 font-medium text-foreground">{h.day}</p>
                {h.enabled ? (
                  <div className="flex items-center gap-2">
                    <Input type="time" defaultValue={h.open} className="w-32" />
                    <span className="text-muted-foreground">to</span>
                    <Input type="time" defaultValue={h.close} className="w-32" />
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">Closed</p>
                )}
              </div>
            ))}
          </div>
          <Button className="mt-4 gradient-primary text-primary-foreground" onClick={() => toast.success("Clinic hours updated")}>Save Hours</Button>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" /> Dental Services & Pricing</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price (₱)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.duration}</TableCell>
                  <TableCell>
                    <Input type="number" defaultValue={s.price} className="w-28" />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => toast.success("Price updated")}>Save</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> Clinic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label>Clinic Name</Label><Input defaultValue="Ayag Dental Clinic" /></div>
            <div><Label>Phone</Label><Input defaultValue="(02) 8123-4567" /></div>
            <div><Label>Email</Label><Input defaultValue="info@ayagdental.com" /></div>
            <div><Label>Address</Label><Input defaultValue="123 Health St, Manila" /></div>
          </div>
          <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success("Settings saved")}>Save Changes</Button>
        </CardContent>
      </Card>
    </div>
  );
}
