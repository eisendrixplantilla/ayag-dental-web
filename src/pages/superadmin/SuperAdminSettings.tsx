import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL } from "@/lib/tableClass";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Clock, Stethoscope, Printer, Loader2, Plus, Trash2, RotateCcw, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { getClinicHours, updateClinicHours, getClinicInfo, updateClinicInfo, type ClinicHourEntry, type ClinicInfo } from "@/lib/api/settings";
import {
  getServices, getRemovedServices, updateService, createService, removeService, restoreService,
  reorderServices, deleteService, type Service, type BlockingRecord,
} from "@/lib/api/dentalRecords";
import { formatManilaDate } from "@/lib/formatDate";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { useAuth, ApiError } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export default function SuperAdminSettings() {
  const [loading, setLoading] = useState(true);

  const [hours, setHours] = useState<ClinicHourEntry[]>([]);
  const [savingHours, setSavingHours] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [durationDrafts, setDurationDrafts] = useState<Record<string, string>>({});
  const [savingServiceId, setSavingServiceId] = useState<string | null>(null);
  // Which row is being dragged, and which one it is currently over.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const [removed, setRemoved] = useState<Service[]>([]);
  // The active catalogue is dragged into order, so it is deliberately not paged --
  // a row cannot be dragged onto a page that is not on screen. Removed services
  // have no order to keep, so they page like every other table.
  const removedPages = usePagination(removed);
  const [removing, setRemoving] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);
  const [savingDelete, setSavingDelete] = useState(false);
  // The records standing in the way, once the server has named them.
  const [blockers, setBlockers] = useState<BlockingRecord[]>([]);
  const closeDelete = () => { setDeleting(null); setBlockers([]); };
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
      setServices(await getServices());
      setRemoved((prev) => prev.filter((s) => s.id !== service.id));
      setPriceDrafts((prev) => ({ ...prev, [back.id]: back.price != null ? String(back.price) : "" }));
      setDurationDrafts((prev) => ({ ...prev, [back.id]: back.duration != null ? String(back.duration) : "" }));
      toast.success(`${back.name} is offered again`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore the service");
    }
  };

  /** Out of the catalogue for good. The server refuses if a dental record still names
   * the service, so a record can't lose a line it once said. */
  const deleteForGood = async (withRecords = false) => {
    if (!deleting) return;
    setSavingDelete(true);
    try {
      await deleteService(deleting.id, withRecords);
      setRemoved((prev) => prev.filter((s) => s.id !== deleting.id));
      toast.success(
        blockers.length > 0 && withRecords
          ? `${deleting.name} deleted, along with ${blockers.length} dental record(s)`
          : `${deleting.name} deleted`,
      );
      closeDelete();
    } catch (err) {
      // A refusal names the records in the way, so the choice can be made knowing
      // exactly what would go with the service rather than only that something would.
      const blocking = err instanceof ApiError ? (err.data.records as BlockingRecord[] | undefined) : undefined;
      if (blocking?.length) setBlockers(blocking);
      else toast.error(err instanceof Error ? err.message : "Failed to delete the service");
    } finally {
      setSavingDelete(false);
    }
  };

  /** Puts `id` at `to`, shifting everything else along. The list moves first and the
   * catalogue follows; if the save fails the old order comes back, so what is on
   * screen is never an order the clinic doesn't actually have. */
  const moveTo = async (id: string, to: number) => {
    const from = services.findIndex((s) => s.id === id);
    if (from < 0 || to < 0 || to >= services.length || to === from) return;

    const next = [...services];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    const previous = services;
    setServices(next);
    setSavingOrder(true);
    try {
      setServices(await reorderServices(next.map((s) => s.id)));
      toast.success(`Moved ${moved.name} to position ${to + 1}`);
    } catch (err) {
      setServices(previous);
      toast.error(err instanceof Error ? err.message : "Failed to save the new order");
    } finally {
      setSavingOrder(false);
    }
  };

  const dropOn = (targetId: string) => {
    const id = dragId;
    setDragId(null);
    setOverId(null);
    if (id && id !== targetId) moveTo(id, services.findIndex((s) => s.id === targetId));
  };

  // Dragging is no use to a keyboard, so the handle also takes the arrow keys.
  const nudge = (id: string, by: number) => {
    if (savingOrder) return;
    moveTo(id, services.findIndex((s) => s.id === id) + by);
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
      setServices(await getServices());
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

      {/* Delete for good */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && closeDelete()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {blockers.length > 0 ? "This service is part of a record" : "Delete Service"}
            </DialogTitle>
            <DialogDescription>
              {blockers.length > 0 ? (
                <>
                  {deleting?.name} is named by {blockers.length} dental record
                  {blockers.length === 1 ? "" : "s"}. Deleting the service deletes{" "}
                  {blockers.length === 1 ? "that record" : "those records"} too — what they say
                  happened, and any treatments and prescriptions under them.
                </>
              ) : (
                <>
                  {deleting?.name} will be gone from the catalogue for good. This can't be undone —
                  if you only want to stop offering it, Restore it and remove it again instead.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Named, so the choice is never made blind. */}
          {blockers.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-md border divide-y text-sm">
              {blockers.map((r) => (
                <li key={r.id} className="px-3 py-2">
                  <p className="font-medium text-foreground">{r.patientName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.date ?? "—"} · {r.diagnosis || "No diagnosis recorded"}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDelete}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteForGood(blockers.length > 0)} disabled={savingDelete}>
              {savingDelete && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {blockers.length > 0
                ? `Delete the service and ${blockers.length} record${blockers.length === 1 ? "" : "s"}`
                : "Delete for good"}
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
                Drag a row by its handle to arrange the list — this is the order patients see
                when they book.
              </p>
            </div>
            <Button className="gradient-primary text-primary-foreground print:hidden" onClick={openAddService}>
              <Plus className="w-4 h-4 mr-2" /> Add Service
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 print:hidden"><span className="sr-only">Reorder</span></TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Price (₱)</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s, i) => (
                <TableRow
                  key={s.id}
                  // The whole row is the drop target, so there is no thin line to hit.
                  onDragOver={(e) => { e.preventDefault(); setOverId(s.id); }}
                  onDragLeave={() => setOverId((prev) => (prev === s.id ? null : prev))}
                  onDrop={(e) => { e.preventDefault(); dropOn(s.id); }}
                  className={cn(
                    dragId === s.id && "opacity-50",
                    overId === s.id && dragId !== s.id && "outline outline-2 -outline-offset-2 outline-primary",
                  )}
                >
                  <TableCell className="print:hidden">
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        if (savingOrder) { e.preventDefault(); return; }
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(s.id);
                      }}
                      onDragEnd={() => { setDragId(null); setOverId(null); }}
                      onKeyDown={(e) => {
                        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                        e.preventDefault();
                        nudge(s.id, e.key === "ArrowUp" ? -1 : 1);
                      }}
                      aria-busy={savingOrder}
                      aria-label={`Reorder ${s.name}, position ${i + 1} of ${services.length}`}
                      title="Drag to reorder, or use the arrow keys"
                      className={cn("cursor-grab text-muted-foreground hover:text-foreground", savingOrder && "opacity-50")}
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                  </TableCell>
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No services found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {removed.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <p className="font-medium text-sm text-foreground">Removed Services</p>
              <p className="text-xs text-muted-foreground mb-3">
                No longer offered for booking. Past records still name them — a service a
                record names can be restored but not deleted.
              </p>
              <Table className={COMPACT_TABLE}>
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
                  {removedPages.paged.map((s) => (
                    <TableRow key={s.id} className="text-muted-foreground">
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.removedAt ?? "—"}</TableCell>
                      <TableCell>{s.removedBy ?? "—"}</TableCell>
                      <TableCell className="max-w-[18rem] whitespace-normal break-words">{s.removedReason ?? "—"}</TableCell>
                      <TableCell className="print:hidden">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" aria-label={`Restore ${s.name}`} onClick={() => bringBack(s)}>
                            <RotateCcw className="w-4 h-4 mr-1" /> Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label={`Delete ${s.name} permanently`}
                            title="Delete permanently"
                            onClick={() => setDeleting(s)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={removedPages.page} onPageChange={removedPages.setPage} total={removed.length} pageSize={PAGE_SIZE} noun="removed service(s)" />
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
