import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  delay?: number;
  /** e.g. a column span in the grid it sits in. */
  className?: string;
}

export default function StatCard({ title, value, icon: Icon, trend, trendUp, delay = 0, className }: StatCardProps) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay }}>
      {/* Two to a row on a phone, so the card tightens up there: less padding, smaller
          type and icon. From sm up it is the full-size card. */}
      <Card className="h-full shadow-card hover:shadow-elevated transition-shadow">
        <CardContent className="p-3.5 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted-foreground">{title}</p>
              <p className="text-xl sm:text-2xl font-bold font-heading mt-1 text-foreground">{value}</p>
              {trend && (
                <p className={`text-xs mt-1 font-medium ${trendUp ? "text-success" : "text-destructive"}`}>
                  {trend}
                </p>
              )}
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-secondary flex items-center justify-center">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
