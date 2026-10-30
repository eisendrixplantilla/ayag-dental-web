import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { formatManilaDateTime } from "@/lib/formatDate";
import { printReport, type ClinicLetterhead, type ReportDoc } from "@/lib/printReport";
import { getLetterhead } from "@/lib/api/settings";
import { describeClinicHours } from "@/lib/clinicHours";

/** How a role signs a document it printed. */
export const roleLabel: Record<string, string> = {
  admin: "Clinic Admin",
  superadmin: "Super Admin",
  dentist: "Dentist",
  patient: "Patient",
};

export type PrintableDoc = Omit<ReportDoc, "preparedBy" | "generatedAt" | "clinic"> & { generatedAt?: string };

/** Fetched once per visit: the clinic's details rarely change, and every page that
 * prints needs the same ones. A failed fetch is forgotten, so the next page tries again. */
let letterhead: Promise<ClinicLetterhead | null> | null = null;
function loadLetterhead(): Promise<ClinicLetterhead | null> {
  letterhead ??= Promise.resolve()
    .then(getLetterhead)
    .then((d) => {
      const info = d?.info;
      const hours = Array.isArray(d?.hours) ? describeClinicHours(d.hours) : "";
      return info || hours ? { ...(info ?? {}), hours } : null;
    })
    .catch(() => {
      letterhead = null;
      return null;
    });
  return letterhead;
}

/** The clinic's letterhead, loaded as the page opens so it's there by the time Print is
 * pressed. If it isn't (or can't be fetched), documents still print, with just the clinic's name. */
export function useLetterhead(): ClinicLetterhead | null {
  const [clinic, setClinic] = useState<ClinicLetterhead | null>(null);
  useEffect(() => {
    let live = true;
    loadLetterhead().then((c) => { if (live) setClinic(c); });
    return () => { live = false; };
  }, []);
  return clinic;
}

/** For tests: forget what was fetched. */
export const resetLetterhead = () => { letterhead = null; };

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
  const clinic = useLetterhead();

  return useCallback(
    (doc: PrintableDoc): boolean => {
      const ok = printReport({
        ...doc,
        generatedAt: doc.generatedAt ?? formatManilaDateTime(),
        clinic,
        preparedBy: { name: user?.name ?? "—", role: roleLabel[user?.role ?? ""] ?? "Staff" },
      });
      if (ok) toast.success("Print preview ready");
      else toast.error("Failed to prepare the print preview");
      return ok;
    },
    [user, clinic],
  );
}
