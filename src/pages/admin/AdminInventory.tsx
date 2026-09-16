import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Package, Plus, Search, AlertTriangle, Edit } from "lucide-react";
import { toast } from "sonner";

const mockInventory = [
  { id: "I001", name: "Dental Composite Resin", category: "Filling", quantity: 45, minStock: 20, unit: "tubes", status: "ok" },
  { id: "I002", name: "Anesthetic Cartridges", category: "Anesthesia", quantity: 8, minStock: 15, unit: "boxes", status: "low" },
  { id: "I003", name: "Latex Gloves (M)", category: "PPE", quantity: 120, minStock: 50, unit: "pairs", status: "ok" },
  { id: "I004", name: "Disposable Masks", category: "PPE", quantity: 12, minStock: 30, unit: "boxes", status: "low" },
  { id: "I005", name: "X-Ray Film", category: "Imaging", quantity: 200, minStock: 50, unit: "sheets", status: "ok" },
  { id: "I006", name: "Orthodontic Wire", category: "Ortho", quantity: 3, minStock: 10, unit: "rolls", status: "low" },
];

export default function AdminInventory() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const filtered = mockInventory.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const lowStock = mockInventory.filter(i => i.status === "low").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Inventory</h1>
          <p className="text-muted-foreground">Track dental supplies and equipment</p>
        </div>
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

      {lowStock > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <p className="text-sm text-foreground"><span className="font-semibold">{lowStock} items</span> are running low on stock</p>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card">
        <CardHeader>
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
                <TableHead>Actions</TableHead>
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
                  <TableCell><Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
