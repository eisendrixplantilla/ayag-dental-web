import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Package, Plus, Search, AlertTriangle, Edit, Printer } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { formatManilaDate } from "@/lib/formatDate";

const mockInventory = [
  { id: "I001", name: "Dental Composite Resin", category: "Filling", quantity: 45, minStock: 20, unit: "tubes", status: "ok" },
  { id: "I002", name: "Anesthetic Cartridges", category: "Anesthesia", quantity: 8, minStock: 15, unit: "boxes", status: "low" },
  { id: "I003", name: "Latex Gloves (M)", category: "PPE", quantity: 120, minStock: 50, unit: "pairs", status: "ok" },
  { id: "I004", name: "Disposable Masks", category: "PPE", quantity: 12, minStock: 30, unit: "boxes", status: "low" },
  { id: "I005", name: "X-Ray Film", category: "Imaging", quantity: 200, minStock: 50, unit: "sheets", status: "ok" },
  { id: "I006", name: "Orthodontic Wire", category: "Ortho", quantity: 3, minStock: 10, unit: "rolls", status: "low" },
];

const inventorySchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  category: z.string().trim().min(1, "Category is required"),
  quantity: z.coerce.number().int().min(0, "Quantity must be valid"),
  minStock: z.coerce.number().int().min(0, "Min stock must be valid"),
  unit: z.string().trim().min(1, "Unit is required"),
});

export default function AdminInventory() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [inventory, setInventory] = useState(mockInventory);
  const [editingItem, setEditingItem] = useState<typeof mockInventory[0] | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "", quantity: "", minStock: "", unit: "" });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const filtered = inventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = inventory.filter(i => i.status === "low").length;

  const openEdit = (item: typeof mockInventory[0]) => {
    setEditingItem(item);
    setEditForm({ name: item.name, category: item.category, quantity: String(item.quantity), minStock: String(item.minStock), unit: item.unit });
    setEditErrors({});
  };

  const handleEditFormChange = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
    if (editErrors[field]) {
      setEditErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleUpdate = () => {
    if (!editingItem) return;
    const parsed = inventorySchema.safeParse(editForm);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.errors.forEach(e => {
        const field = e.path[0] as string;
        if (!errors[field]) errors[field] = e.message;
      });
      setEditErrors(errors);
      return;
    }

    setInventory(prev => prev.map(i => i.id === editingItem.id ? {
      ...i,
      name: parsed.data.name,
      category: parsed.data.category,
      quantity: parsed.data.quantity,
      minStock: parsed.data.minStock,
      unit: parsed.data.unit,
      status: parsed.data.quantity < parsed.data.minStock ? "low" : "ok",
    } : i));

    toast.success("Item updated successfully");
    setEditingItem(null);
  };

  return (
    <div className="space-y-6">
      <div className="hidden print:flex print:items-center print:gap-3 print:pb-4">
        <img src="/clinic-logo.png" alt="Ayag Dental Clinic" className="w-10 h-10 object-contain" />
        <div>
          <p className="text-lg font-bold font-heading">Ayag Dental Clinic</p>
          <p className="text-xs">Inventory · Generated {formatManilaDate()}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Inventory</h1>
          <p className="text-muted-foreground">Track dental supplies and equipment</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button onClick={() => window.print()} variant="outline">
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Add Item</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">Add Inventory Item</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Item Name</Label><Input placeholder="Item name" /></div>
              <div><Label>Category</Label><Input placeholder="Category" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Quantity</Label><Input type="number" placeholder="0" /></div>
                <div><Label>Min Stock</Label><Input type="number" placeholder="0" /></div>
                <div><Label>Unit</Label><Input placeholder="pcs" /></div>
              </div>
              <Button className="w-full gradient-primary text-primary-foreground" onClick={() => { toast.success("Item added"); setShowAdd(false); }}>Save Item</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {lowStock > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-sm text-foreground"><span className="font-semibold">{lowStock} items</span> are running low on stock</p>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader className="print:hidden">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Min Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">{item.id}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.quantity} {item.unit}</TableCell>
                  <TableCell>{item.minStock} {item.unit}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={item.status === "low" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-success/10 text-success border-success/20"}>
                      {item.status === "low" ? "Low Stock" : "In Stock"}
                    </Badge>
                  </TableCell>
                  <TableCell className="print:hidden"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}><Edit className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingItem} onOpenChange={(o) => !o && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-heading">Edit Inventory Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Item Name</Label>
              <Input placeholder="Item name" value={editForm.name} onChange={e => handleEditFormChange("name", e.target.value)} />
              {editErrors.name && <p className="text-xs text-destructive mt-1">{editErrors.name}</p>}
            </div>
            <div>
              <Label>Category</Label>
              <Input placeholder="Category" value={editForm.category} onChange={e => handleEditFormChange("category", e.target.value)} />
              {editErrors.category && <p className="text-xs text-destructive mt-1">{editErrors.category}</p>}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" placeholder="0" value={editForm.quantity} onChange={e => handleEditFormChange("quantity", e.target.value)} />
                {editErrors.quantity && <p className="text-xs text-destructive mt-1">{editErrors.quantity}</p>}
              </div>
              <div>
                <Label>Min Stock</Label>
                <Input type="number" placeholder="0" value={editForm.minStock} onChange={e => handleEditFormChange("minStock", e.target.value)} />
                {editErrors.minStock && <p className="text-xs text-destructive mt-1">{editErrors.minStock}</p>}
              </div>
              <div>
                <Label>Unit</Label>
                <Input placeholder="pcs" value={editForm.unit} onChange={e => handleEditFormChange("unit", e.target.value)} />
                {editErrors.unit && <p className="text-xs text-destructive mt-1">{editErrors.unit}</p>}
              </div>
            </div>
            <Button className="w-full gradient-primary text-primary-foreground" onClick={handleUpdate}>Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
