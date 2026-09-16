import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Clock, Users } from "lucide-react";

export default function PatientQueue() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-heading text-foreground">Queue Status</h1>
        <p className="text-muted-foreground">Check your position in the queue</p>
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="shadow-elevated border-primary/20">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground text-sm uppercase tracking-wider">Your Queue Number</p>
            <p className="text-8xl font-bold font-heading text-primary my-4">05</p>
            <p className="text-lg font-medium text-foreground">Dental Cleaning</p>
            <p className="text-muted-foreground">Mar 20, 2024 at 10:00 AM</p>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-6 text-center">
            <Clock className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Currently Serving</p>
            <p className="text-3xl font-bold font-heading text-foreground mt-1">02</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-6 text-center">
            <Users className="w-8 h-8 text-accent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Patients Ahead</p>
            <p className="text-3xl font-bold font-heading text-foreground mt-1">3</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
