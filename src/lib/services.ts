import { toMinutes, toValue } from "@/lib/dentistSchedules";

/** A visit can cover several services, stored in one comma-separated field. */
export const SERVICE_SEPARATOR = ", ";

/** The individual services on an appointment, for listing or filtering. */
export function splitServices(service: string | null | undefined): string[] {
  return service ? service.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** What the booking forms offer when the clinic's own list can't be loaded. Normally the
 * list comes from Dental Services & Pricing, where the superadmin maintains it. */
export const FALLBACK_SERVICES = [
  "Orthodontics (Braces)", "EXO (Bunot)", "Restoration", "Oral", "Veneers",
  "Denture (Pustiso)", "Implant", "Surgery", "TMJ", "Root Canal",
  "Teeth Whitening", "Fixed Bridge",
];

/** What a service takes when the clinic hasn't set a duration for it. */
export const DEFAULT_SERVICE_MINUTES = 30;

/** How long a visit needs, from the durations the clinic has set for each service. */
export function totalServiceMinutes(chosen: string[], durations: Record<string, number>): number {
  return chosen.reduce((total, s) => total + (durations[s] ?? DEFAULT_SERVICE_MINUTES), 0);
}

/** "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ") || "0 min";
}

/** The "HH:MM" a visit of `minutes` starting at `start` runs until. */
export function endTimeFor(start: string, minutes: number): string {
  return toValue(toMinutes(start) + minutes);
}
