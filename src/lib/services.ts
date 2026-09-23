/** A visit can cover several services, stored in one comma-separated field. */
export const SERVICE_SEPARATOR = ", ";

/** The individual services on an appointment, for listing or filtering. */
export function splitServices(service: string | null | undefined): string[] {
  return service ? service.split(",").map((s) => s.trim()).filter(Boolean) : [];
}
