import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListOrdered, UserPlus, SkipForward, CheckCircle, Search } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

const queueData = [
  { number: 1, patient: "Maria Garcia", service: "Dental Cleaning", status: "completed", type: "appointment" },
  { number: 2, patient: "James Wilson", service: "Tooth Extraction", status: "completed", type: "appointment" },
  { number: 3, patient: "Emma Davis", service: "Root Canal", status: "serving", type: "appointment" },
  { number: 4, patient: "Robert Brown", service: "Check-up", status: "waiting", type: "appointment" },
  { number: 5, patient: "Lisa Anderson", service: "Filling", status: "waiting", type: "appointment" },
  { number: 6, patient: "Carlo Reyes", service: "Tooth Extraction", status: "waiting", type: "walk-in" },
  { number: 7, patient: "Ana Santos", service: "Check-up", status: "waiting", type: "walk-in" },
];

const statusConfig: Record<string, { color: string; label: string }> = {
  completed: { color: "bg-success/10 text-success border-success/20", label: "Completed" },
  serving: { color: "bg-accent/10 text-accent border-accent/20", label: "Now Serving" },
  waiting: { color: "bg-warning/10 text-warning border-warning/20", label: "Waiting" },
};

export default function AdminQueue() {
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkinSearch, setWalkinSearch] = useState("");
  const serving = queueData.find(q => q.status === "serving");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">Queue Management</h1>
          <p className="text-muted-foreground">Manage walk-ins and patient queue</p>
        </div>
        <Dialog open={showWalkIn} onOpenChange={setShowWalkIn}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground"><UserPlus className="w-4 h-4 mr-2" />Add Walk-in Patient</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-heading">Add Walk-in Patient</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Search Existing Patient</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by name or phone..." value={walkinSearch} onChange={e => setWalkinSearch(e.target.value)} className="pl-10" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Search for returning patients to load their history</p>
              </div>
              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground mb-3">Or enter new patient info:</p>
                <div className="space-y-3">
                  <div><Label>Full Name</Label><Input placeholder="Patient name" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Phone</Label><Input placeholder="Phone number" /></div>
                    <div><Label>Age</Label><Input type="number" placeholder="Age" /></div>
                  </div>
                  <div><Label>Service Needed</Label>
                    <Select>
                      <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cleaning">Dental Cleaning</SelectItem>
                        <SelectItem value="extraction">Tooth Extraction</SelectItem>
                        <SelectItem value="filling">Filling</SelectItem>
                        <SelectItem value="rootcanal">Root Canal</SelectItem>
                        <SelectItem value="checkup">Check-up</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <Button className="w-full gradient-primary text-primary-foreground" onClick={() => { toast.success("Walk-in patient added to queue. Queue #8 assigned."); setShowWalkIn(false); }}>
                Add to Queue
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="shadow-elevated border-primary/20">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm uppercase tracking-wider">Now Serving</p>
            <p className="text-8xl font-bold font-heading text-primary my-4">
              {String(serving?.number || 0).padStart(2, "0")}
            </p>
            <p className="text-xl font-semibold text-foreground">{serving?.patient}</p>
            <p className="text-muted-foreground">{serving?.service}</p>
            <div className="flex justify-center gap-3 mt-6">
              <Button className="gradient-primary text-primary-foreground" onClick={() => toast.success("Consultation marked as done")}>
                <CheckCircle className="w-4 h-4 mr-2" />Mark Done
              </Button>
              <Button variant="outline" onClick={() => toast.info("Calling next patient...")}>
                <SkipForward className="w-4 h-4 mr-2" />Call Next
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Queue List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {queueData.map(q => (
              <div key={q.number} className={`flex items-center gap-4 p-4 rounded-lg ${q.status === "serving" ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold font-heading text-lg ${q.status === "serving" ? "gradient-primary text-primary-foreground" : q.status === "completed" ? "bg-success/10 text-success" : "bg-secondary text-secondary-foreground"}`}>
                  {String(q.number).padStart(2, "0")}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{q.patient}</p>
                  <p className="text-sm text-muted-foreground">{q.service}</p>
                </div>
                <div className="flex items-center gap-2">
                  {q.type === "walk-in" && <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">Walk-in</Badge>}
                  <Badge variant="outline" className={statusConfig[q.status].color}>{statusConfig[q.status].label}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
