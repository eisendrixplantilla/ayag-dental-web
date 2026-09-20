import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Clock, Stethoscope, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getClinicHours, updateClinicHours, getClinicInfo, updateClinicInfo, type ClinicHourEntry, type ClinicInfo } from "@/lib/api/settings";
import { getServices, updateServicePrice, type Service } from "@/lib/api/dentalRecords";

export default function SuperAdminSettings() {
  const [loading, setLoading] = useState(true);

  const [hours, setHours] = useState<ClinicHourEntry[]>([]);
  const [savingHours, setSavingHours] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);

  const [info, setInfo] = useState<ClinicInfo>({ name: "", phone: "", email: "", address: "" });
  const [savingInfo, setSavingInfo] = useState(false);

  useEffect(() => {
    Promise.all([getClinicHours(), getServices(), getClinicInfo()])
      .then(([h, s, i]) => {
        setHours(h);
        setServices(s);
        setPriceDrafts(Object.fromEntries(s.map((svc) => [svc.id, svc.price != null ? String(svc.price) : ""])));
        setInfo(i);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const setHourField = (day: string, field: "open" | "close", value: string) => {
    setHours((prev) => prev.map((h) => (h.day === day ? { ...h, [field]: value } : h)));
  };

  const saveHours = async () => {
    setSavingHours(true);
    try {
      await updateClinicHours(hours);
      toast.success("Clinic hours updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update clinic hours");
    } finally {
      setSavingHours(false);
    }
  };

  const savePrice = async (service: Service) => {
    const raw = priceDrafts[service.id];
    const price = Number(raw);
    if (!raw || Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setSavingServiceId(service.id);
    try {
      const updated = await updateServicePrice(service.id, { price });
      setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
      toast.success("Price updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update price");
    } finally {
      setSavingServiceId(null);
    }
  };

  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      const updated = await updateClinicInfo(info);
      setInfo(updated);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save clinic information");
    } finally {
      setSavingInfo(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Dental Services &amp; Pricing · Generated {new Date().toLocaleDateString()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">System Settings</h1>
          <p className="text-muted-foreground">Configure clinic hours, services, and pricing</p>
        </div>
        <Button onClick={() => window.print()} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-primary" /> Clinic Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(loading ? [] : hours).map((h) => (
              <div key={h.day} className="flex flex-wrap items-center gap-2 sm:gap-4 p-3 rounded-lg bg-muted/50">
                <p className="w-24 font-medium text-foreground">{h.day}</p>
                {h.enabled ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input type="time" value={h.open} onChange={(e) => setHourField(h.day, "open", e.target.value)} className="w-32" />
                    <span className="text-muted-foreground">to</span>
                    <Input type="time" value={h.close} onChange={(e) => setHourField(h.day, "close", e.target.value)} className="w-32" />
                  </div>
                ) : (
                  <p className="text-muted-foreground italic">Closed</p>
                )}
              </div>
            ))}
            {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          </div>
          <Button className="mt-4 gradient-primary text-primary-foreground" onClick={saveHours} disabled={loading || savingHours}>
            {savingHours ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save Hours
          </Button>
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
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.duration != null ? `${s.duration} min` : "—"}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={priceDrafts[s.id] ?? ""}
                      onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell className="print:hidden">
                    <Button variant="ghost" size="sm" onClick={() => savePrice(s)} disabled={savingServiceId === s.id}>
                      {savingServiceId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">No services found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="font-heading text-lg flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> Clinic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Clinic Name</Label>
              <Input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} disabled={loading} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={info.phone ?? ""} onChange={(e) => setInfo({ ...info, phone: e.target.value })} disabled={loading} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={info.email ?? ""} onChange={(e) => setInfo({ ...info, email: e.target.value })} disabled={loading} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={info.address ?? ""} onChange={(e) => setInfo({ ...info, address: e.target.value })} disabled={loading} />
            </div>
          </div>
          <Button className="gradient-primary text-primary-foreground" onClick={saveInfo} disabled={loading || savingInfo}>
            {savingInfo ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Save Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
