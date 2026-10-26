import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COMPACT_TABLE, WRAP_CELL, PIN_COL, CODE_COL, NUM_COL } from "@/lib/tableClass";
import TablePagination from "@/components/TablePagination";
import { usePagination, PAGE_SIZE } from "@/hooks/usePagination";
import SortableHead from "@/components/SortableHead";
import { useTableSort } from "@/hooks/useTableSort";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatCard from "@/components/StatCard";
import { usePrintDocument } from "@/hooks/usePrintDocument";
import { DollarSign, TrendingUp, Receipt, CreditCard, Plus, Printer } from "lucide-react";
import { IconAction, RowActions } from "@/components/RowActions";
import { toast } from "sonner";

const mockSales = [
  { id: "S001", patient: "Maria Garcia", service: "Dental Cleaning", amount: 1500, date: "2024-03-15", status: "paid" },
  { id: "S002", patient: "James Wilson", service: "Tooth Extraction", amount: 3000, date: "2024-03-15", status: "paid" },
  { id: "S003", patient: "Emma Davis", service: "Root Canal", amount: 8000, date: "2024-03-15", status: "pending" },
  { id: "S004", patient: "Robert Brown", service: "Check-up", amount: 500, date: "2024-03-14", status: "paid" },
  { id: "S005", patient: "Lisa Anderson", service: "Filling", amount: 2500, date: "2024-03-14", status: "paid" },
];

type Sale = typeof mockSales[number];

const saleRow = (s: Sale) => [s.id, s.patient, s.service, String(s.amount), s.date, s.status];

export default function AdminSales() {
  const { sorted, sortKey, headProps } = useTableSort(mockSales, saleRow);
  const { page, setPage, paged } = usePagination(sorted, sortKey);
  const [showRecord, setShowRecord] = useState(false);
  const print = usePrintDocument();

  // A receipt is the same clinic document as every other printout, with one charge on it.
  const printReceipt = (s: Sale) =>
    print({
      title: "Official Receipt",
      filters: [
        { label: "Receipt No.", value: s.id },
        { label: "Patient", value: s.patient },
        { label: "Date", value: s.date },
        { label: "Payment Status", value: s.status === "paid" ? "Paid" : "Pending" },
      ],
      columns: ["Description", "Amount (₱)"],
      rows: [
        [s.service, s.amount.toLocaleString()],
        ["Total", s.amount.toLocaleString()],
      ],
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Sales & Bookkeeping</h1>
          <p className="text-muted-foreground">Record payments, generate receipts, daily income</p>
        </div>
        <Dialog open={showRecord} onOpenChange={setShowRecord}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><Plus className="w-4 h-4 mr-2" />Record Payment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">Record Payment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Patient</Label><Input placeholder="Search patient..." /></div>
              <div><Label>Service</Label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cleaning">Dental Cleaning - ₱1,500</SelectItem>
                    <SelectItem value="extraction">Tooth Extraction - ₱3,000</SelectItem>
                    <SelectItem value="filling">Filling - ₱2,500</SelectItem>
                    <SelectItem value="rootcanal">Root Canal - ₱8,000</SelectItem>
                    <SelectItem value="checkup">Check-up - ₱500</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amount (₱)</Label><Input type="number" placeholder="0" /></div>
                <div><Label>Payment Method</Label>
                  <Select>
                    <SelectTrigger><SelectValue placeholder="Method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="gcash">GCash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full gradient-primary text-primary-foreground" onClick={() => { toast.success("Payment recorded"); setShowRecord(false); }}>Record Payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Today's Revenue" value="₱12,500" icon={DollarSign} trend="+18%" trendUp delay={0} />
        <StatCard title="Weekly Revenue" value="₱68,200" icon={TrendingUp} trend="+12%" trendUp delay={0.1} />
        <StatCard title="Pending Payments" value="₱8,000" icon={Receipt} delay={0.2} />
        <StatCard title="Total Transactions" value={42} icon={CreditCard} delay={0.3} />
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className={COMPACT_TABLE}>
            <TableHeader>
              <TableRow>
                <SortableHead className={CODE_COL} {...headProps(0)}>ID</SortableHead>
                <SortableHead {...headProps(1)} className={PIN_COL}>Patient</SortableHead>
                <SortableHead {...headProps(2)}>Service</SortableHead>
                <SortableHead className={NUM_COL} {...headProps(3)}>Amount</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(4)}>Date</SortableHead>
                <SortableHead className={CODE_COL} {...headProps(5)}>Status</SortableHead>
                <TableHead className={CODE_COL}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map(s => (
                <TableRow key={s.id}>
                  <TableCell className={`font-mono text-sm ${CODE_COL}`}>{s.id}</TableCell>
                  <TableCell className={`font-medium ${WRAP_CELL} ${PIN_COL}`}>{s.patient}</TableCell>
                  <TableCell className={WRAP_CELL}>{s.service}</TableCell>
                  <TableCell className={`font-semibold ${NUM_COL}`}>₱{s.amount.toLocaleString()}</TableCell>
                  <TableCell className={CODE_COL}>{s.date}</TableCell>
                  <TableCell className={CODE_COL}>
                    <Badge variant="outline" className={s.status === "paid" ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className={CODE_COL}>
                    <RowActions>
                      <IconAction label="Print receipt" ariaLabel={`Print receipt ${s.id}`} icon={Printer} onClick={() => printReceipt(s)} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} onPageChange={setPage} total={mockSales.length} pageSize={PAGE_SIZE} noun="transaction(s)" />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Daily Income Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Dental Cleaning", count: 3, total: "₱4,500" },
              { label: "Tooth Extraction", count: 2, total: "₱6,000" },
              { label: "Root Canal", count: 1, total: "₱8,000" },
              { label: "Check-up", count: 4, total: "₱2,000" },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/50 text-center">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="font-bold text-foreground">{item.total}</p>
                <p className="text-xs text-muted-foreground">{item.count} patients</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
