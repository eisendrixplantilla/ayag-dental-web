/*
 * The dental chart's codes, as on the standard Philippine dental record: what a tooth's
 * condition is, and what restoration, surgery or X-ray it has had. A record keeps them per
 * tooth ({ "16": ["D", "Am"] }), apart from its procedures, which are the clinic's services.
 */

export type CodeGroup = "condition" | "restoration" | "surgery" | "xray";

export interface ToothCode {
  /** What's saved; unique across the groups (the X-ray "P" is "XR-P", apart from Pontic). */
  id: string;
  /** What the chart shows. */
  code: string;
  name: string;
  group: CodeGroup;
}

export const CODE_GROUPS: { group: CodeGroup; label: string; color: string }[] = [
  { group: "condition", label: "Condition", color: "#d12f2f" },
  { group: "restoration", label: "Restoration & Prosthodontics", color: "#2a78d6" },
  { group: "surgery", label: "Surgery", color: "#6250d6" },
  { group: "xray", label: "X-ray", color: "#57606a" },
];

const c = (id: string, code: string, name: string, group: CodeGroup): ToothCode => ({ id, code, name, group });

export const TOOTH_CODES: ToothCode[] = [
  c("present", "✓", "Present tooth", "condition"),
  c("D", "D", "Decayed (caries)", "condition"),
  c("M", "M", "Missing due to caries", "condition"),
  c("MO", "MO", "Missing due to other causes", "condition"),
  c("Im", "Im", "Impacted tooth", "condition"),
  c("Sp", "Sp", "Supernumerary tooth", "condition"),
  c("Rf", "Rf", "Root fragment", "condition"),
  c("Un", "Un", "Unerupted", "condition"),

  c("Am", "Am", "Amalgam filling", "restoration"),
  c("Co", "Co", "Composite filling", "restoration"),
  c("LCF", "LCF", "Light-cure composite filling", "restoration"),
  c("GI", "GI", "Glass ionomer", "restoration"),
  c("TF", "TF", "Temporary filling", "restoration"),
  c("In", "In", "Inlay", "restoration"),
  c("JC", "JC", "Jacket crown", "restoration"),
  c("PJC", "PJC", "Porcelain jacket crown", "restoration"),
  c("MC", "MC", "Metal crown", "restoration"),
  c("V", "V", "Veneer", "restoration"),
  c("Ab", "Ab", "Abutment", "restoration"),
  c("Att", "Att", "Attachment", "restoration"),
  c("P", "P", "Pontic", "restoration"),
  c("Imp", "Imp", "Implant", "restoration"),
  c("S", "S", "Sealant", "restoration"),
  c("Rm", "Rm", "Removable denture", "restoration"),

  c("X", "X", "Extraction due to caries", "surgery"),
  c("XO", "XO", "Extraction due to other causes", "surgery"),

  c("XR-P", "P", "Periapical X-ray", "xray"),
  c("XR-C", "C", "Cephalometric X-ray", "xray"),
  c("XR-O", "O", "Occlusal X-ray", "xray"),
  c("XR-PR", "PR", "Panoramic X-ray", "xray"),
];

const BY_ID = new Map(TOOTH_CODES.map((t) => [t.id, t]));

/** A saved code's details; an id the list no longer has shows as itself. */
export const codeOf = (id: string): ToothCode => BY_ID.get(id) ?? { id, code: id, name: id, group: "condition" };

export const groupColor = (g: CodeGroup) => CODE_GROUPS.find((x) => x.group === g)!.color;

/** The groups a tooth's codes fall in, in the list's order: the colours it's filled with.
 * "Present tooth" alone is a healthy tooth, so it doesn't colour it. */
export const groupsOf = (ids: string[]) =>
  CODE_GROUPS.filter((g) => ids.some((id) => id !== "present" && codeOf(id).group === g.group));

/** Each tooth's codes, in the list's order. */
export type ToothCodes = Record<string, string[]>;

/** A note on a tooth, by tooth. */
export type ToothNotes = Record<string, string>;

/** The codes with one ticked or unticked on a tooth; a tooth left with none drops out. */
export function withCode(codes: ToothCodes, tooth: number, id: string, on: boolean): ToothCodes {
  const had = codes[tooth] ?? [];
  const next = on ? [...new Set([...had, id])] : had.filter((x) => x !== id);
  const order = (x: string) => { const i = TOOTH_CODES.findIndex((t) => t.id === x); return i < 0 ? TOOTH_CODES.length : i; };
  const out = { ...codes };
  if (next.length) out[tooth] = next.sort((a, b) => order(a) - order(b));
  else delete out[tooth];
  return out;
}

/** "D, Am" for a tooth. */
export const codeText = (ids: string[]) => ids.map((id) => codeOf(id).code).join(", ");
