import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Clock, Stethoscope, Printer, Loader2, Plus, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { getClinicHours, updateClinicHours, getClinicInfo, updateClinicInfo, type ClinicHourEntry, type ClinicInfo } from "@/lib/api/settings";
import {
  getServices, getRemovedServices, updateService, createService, removeService, restoreService, type Service,
} from "@/lib/api/dentalRecords";
import { formatManilaDate } from "@/lib/formatDate";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { useAuth } from "@/contexts/AuthContext";

export default function SuperAdminSettings() {
  const [loading, setLoading] = useState(true);

  const [hours, setHours] = useState<ClinicHourEntry[]>([]);
  const [savingHours, setSavingHours] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);

  const [removed, setRemoved] = useState<Service[]>([]);
  const [removing, setRemoving] = useState<Service | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [savingRemoval, setSavingRemoval] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newService, setNewService] = useState({ name: "", duration: "30", price: "" });
  const [savingNew, setSavingNew] = useState(false);

  const [info, setInfo] = useState<ClinicInfo>({ name: "", phone: "", email: "", address: "" });
  const [savingInfo, setSavingInfo] = useState(false);

  const { user } = useAuth();
  const print = usePrintDocument();
  const handlePrint = () =>
    print({
      title: "System Settings",
      filters: [
        { label: "Clinic", value: info.name || "Ayag Dental Clinic" },
        { label: "Contact Number", value: info.phone || "—" },
        { label: "Email Address", value: info.email || "—" },
        { label: "Address", value: info.address || "—" },
      ],
      tables: [
        {
          heading: "Clinic Hours",
          columns: ["Day", "Opens", "Closes"],
          rows: hours.map(h => [h.day, h.enabled ? h.open : "Closed", h.enabled ? h.close : "Closed"]),
          emptyText: "No clinic hours set.",
        },
        {
          heading: "Dental Services & Pricing",
          columns: ["Service", "Duration", "Price (₱)"],
          rows: services.map(s => [
            s.name,
            s.duration != null ? `${s.duration} min` : "—",
            s.price != null ? Number(s.price).toLocaleString() : "—",
          ]),
          emptyText: "No services configured.",
        },
      ],
    });

  useEffect(() => {
    Promise.all([getClinicHours(), getServices(), getClinicInfo(), getRemovedServices()])
      .then(([h, s, i, gone]) => {
        setHours(h);
        setServices(s);
        setRemoved(gone);
        setPriceDrafts(Object.fromEntries(s.map((svc) => [svc.id, svc.price != null ? String(svc.price) : ""])));
        setDurationDrafts(Object.fromEntries(s.map((svc) => [svc.id, svc.duration != null ? String(svc.duration) : ""])));
        setInfo(i);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const openRemove = (service: Service) => {
    setRemoveReason("");
    setRemoving(service);
  };

  // Removing keeps the row: dental records that used the service still name it, it just
  // stops being offered for booking.
  const confirmRemove = async () => {
    if (!removing) return;
    const reason = removeReason.trim();
    if (!reason) {
      toast.error("Please give a reason for removing this service");
      return;
    }
    setSavingRemoval(true);
    try {
      const gone = await removeService(removing.id, reason, user?.name);
      setServices((prev) => prev.filter((s) => s.id !== removing.id));
      setRemoved((prev) => [gone, ...prev]);
      setRemoving(null);
      toast.success(`${gone.name} removed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove the service");
    } finally {
      setSavingRemoval(false);
    }
  };

  const bringBack = async (service: Service) => {
    try {
      const back = await restoreService(service.id);
      setRemoved((prev) => prev.filter((s) => s.id !== service.id));
      setServices((prev) => [...prev, back].sort((a, b) => a.name.localeCompare(b.name)));
      setPriceDrafts((prev) => ({ ...prev, [back.id]: back.price != null ? String(back.price) : "" }));
      setDurationDrafts((prev) => ({ ...prev, [back.id]: back.duration != null ? String(back.duration) : "" }));
      toast.success(`${back.name} is offered again`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore the service");
    }
  };

  const openAddService = () => {
    setNewService({ name: "", duration: "30", price: "" });
    setAdding(true);
  };

  // A new service joins the list the booking forms read, so it needs the same two
  // numbers an existing one does: how long it takes, and what it costs.
  const addService = async () => {
    const name = newService.name.trim();
    const duration = Number(newService.duration);
    const price = Number(newService.price);
    if (!name) {
      toast.error("Enter the service name");
      return;
    }
    if (!newService.duration || !Number.isInteger(duration) || duration <= 0) {
      toast.error("Enter the minutes this service takes");
      return;
    }
    if (!newService.price || Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }

    setSavingNew(true);
    try {
      const created = await createService({ name, duration, price });
      setServices((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setPriceDrafts((prev) => ({ ...prev, [created.id]: created.price != null ? String(created.price) : "" }));
      setDurationDrafts((prev) => ({ ...prev, [created.id]: created.duration != null ? String(created.duration) : "" }));
      setAdding(false);
      toast.success(`${created.name} added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add the service");
    } finally {
      setSavingNew(false);
    }
  };

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

  const saveService = async (service: Service) => {
    const price = Number(priceDrafts[service.id]);
    const duration = Number(durationDrafts[service.id]);
    if (!priceDrafts[service.id] || Number.isNaN(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    if (!durationDrafts[service.id] || !Number.isInteger(duration) || duration <= 0) {
      toast.error("Enter the minutes this service takes");
      return;
    }
    setSavingServiceId(service.id);
    try {
      const updated = await updateService(service.id, { price, duration });
      setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s)));
      toast.success(`${updated.name} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update service");
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
          <p className="text-xs">Dental Services &amp; Pricing · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">System Settings</h1>
          <p className="text-muted-foreground">Configure clinic hours, services, and pricing</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="print:hidden">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Remove Dental Service</DialogTitle>
            <DialogDescription>
              {removing?.name} stops being offered on the booking forms. Dental records that
              already name it are untouched, and it can be restored later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="remove-reason">Reason for removing</Label>
            <Textarea
              id="remove-reason"
              rows={3}
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="e.g. No longer offered — equipment retired."
            />
            <p className="text-xs text-muted-foreground">
              Required. The reason is kept with the service under Removed Services.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={savingRemoval || !removeReason.trim()}>
              {savingRemoval && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adding} onOpenChange={(o) => !o && setAdding(false)}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">Add Dental Service</DialogTitle>
            <DialogDescription>
              It becomes bookable straight away — patients and the walk-in desk pick it by name,
              and the visit reserves the minutes set here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="service-name">Service Name</Label>
              <Input
                id="service-name"
                value={newService.name}
                onChange={(e) => setNewService((s) => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Fluoride Treatment"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="service-duration">Duration (minutes)</Label>
                <Input
                  id="service-duration"
                  type="number"
                  min={5}
                  step={5}
                  value={newService.duration}
                  onChange={(e) => setNewService((s) => ({ ...s, duration: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="service-price">Price (₱)</Label>
                <Input
                  id="service-price"
                  type="number"
                  min={0}
                  step={100}
                  value={newService.price}
                  onChange={(e) => setNewService((s) => ({ ...s, price: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground" onClick={addService} disabled={savingNew}>
              {savingNew && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add Service
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-heading text-lg flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" /> Dental Services & Pricing</CardTitle>
              <p className="text-sm text-muted-foreground">
                Duration is what the booking forms reserve: a visit is offered only the time slots
                long enough for the services chosen. A service can be booked once it has one.
              </p>
            </div>
            <Button className="gradient-primary text-primary-foreground print:hidden" onClick={openAddService}>
              <Plus className="w-4 h-4 mr-2" /> Add Service
            </Button>
          </div>
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
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={5}
                        step={5}
                        aria-label={`Duration for ${s.name} in minutes`}
                        value={durationDrafts[s.id] ?? ""}
                        onChange={(e) => setDurationDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">min</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      aria-label={`Price for ${s.name}`}
                      value={priceDrafts[s.id] ?? ""}
                      onChange={(e) => setPriceDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      className="w-28"
                    />
                  </TableCell>
                  <TableCell className="print:hidden">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => saveService(s)} disabled={savingServiceId === s.id}>
                        {savingServiceId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        aria-label={`Remove ${s.name}`}
                        title="Remove"
                        onClick={() => openRemove(s)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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

          {removed.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="font-medium text-sm text-foreground">Removed Services</p>
              <p className="text-xs text-muted-foreground mb-3">
                No longer offered for booking. Past records still name them.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Date Removed</TableHead>
                    <TableHead>Removed By</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="print:hidden">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {removed.map((s) => (
                    <TableRow key={s.id} className="text-muted-foreground">
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.removedAt ?? "—"}</TableCell>
                      <TableCell>{s.removedBy ?? "—"}</TableCell>
                      <TableCell className="max-w-[18rem] whitespace-normal break-words">{s.removedReason ?? "—"}</TableCell>
                      <TableCell className="print:hidden">
                        <Button variant="ghost" size="sm" aria-label={`Restore ${s.name}`} onClick={() => bringBack(s)}>
                          <RotateCcw className="w-4 h-4 mr-1" /> Restore
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
