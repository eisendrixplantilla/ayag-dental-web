import { useEffect, useState } from "react";
import { getServices, type Service } from "@/lib/api/dentalRecords";

/**
 * One colour per service on the dental chart, always the same one: each service takes the
 * next of these by its place in the catalogue, as the Super Admin ordered it. The eight
 * are a checked categorical set (told apart with colour-blindness too); a ninth service
 * shares the first one's colour, and the chart names every procedure beside its colour,
 * so colour never has to say which on its own.
 */
export const PROCEDURE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

/** A service the catalogue doesn't have (renamed, removed, typed by hand): a colour from its name. */
function fromName(name: string): string {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROCEDURE_COLORS[h % PROCEDURE_COLORS.length];
}

const key = (name: string) => name.trim().toLowerCase();

/** The catalogue, read once for every chart on the page and kept. */
let catalogue: Promise<Service[]> | null = null;
const loadCatalogue = () => {
  catalogue ??= getServices().then((list) => (Array.isArray(list) ? list : [])).catch(() => {
    catalogue = null;
    return [];
  });
  return catalogue;
};

/** The catalogue's services (for picking a procedure), and each one's colour by name. */
export function useProcedureColors() {
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    let live = true;
    loadCatalogue().then((list) => { if (live) setServices(list); });
    return () => { live = false; };
  }, []);
  const ordered = [...services].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  const slot = new Map(ordered.map((s, i) => [key(s.name), PROCEDURE_COLORS[i % PROCEDURE_COLORS.length]]));
  return {
    services: ordered,
    colorOf: (name: string) => slot.get(key(name)) ?? fromName(name),
  };
}
