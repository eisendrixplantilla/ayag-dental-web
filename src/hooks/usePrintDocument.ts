import { useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaDateTime } from "@/lib/formatDate";
import { printReport, type ReportDoc } from "@/lib/printReport";

/** How a role signs a document it printed. */
export const roleLabel: Record<string, string> = {
  admin: "Clinic Admin",
  superadmin: "Super Admin",
  dentist: "Dentist",
  patient: "Patient",
};

export type PrintableDoc = Omit<ReportDoc, "preparedBy" | "generatedAt"> & { generatedAt?: string };

/** How a page's From/To boxes read on the document, with either end left open. */
export function printRange(from: string, to: string): string {
  if (from && to) return `${from} to ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Up to ${to}`;
  return "All dates";
}

/** Prints a page's data as the clinic's standard document — the same one the Reports
 * pages produce — so every Print button in the system comes off the printer alike:
 * letterhead, who prepared it and when, numbered tables, signature, page numbers.
 *
 * The caller passes only what is on the page; who is printing and the timestamp are
 * filled in from the session here, so no page has to remember to. */
export function usePrintDocument() {
  const { user } = useAuth();

  return useCallback(
    (doc: PrintableDoc): boolean => {
      const ok = printReport({
        ...doc,
        generatedAt: doc.generatedAt ?? formatManilaDateTime(),
        preparedBy: { name: user?.name ?? "—", role: roleLabel[user?.role ?? ""] ?? "Staff" },
      });
      if (ok) toast.success("Print preview ready");
      else toast.error("Failed to prepare the print preview");
      return ok;
    },
    [user],
  );
}
