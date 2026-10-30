import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { ADULT, CHILD, formatTeeth, isChild, parseTeeth } from "@/lib/teeth";
import Segmented from "@/components/Segmented";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useProcedureColors } from "@/lib/procedureColors";
import Hint from "@/components/Hint";
import { CODE_GROUPS, TOOTH_CODES, codeOf, groupColor, groupsOf, withCode, type ToothCodes, type ToothNotes } from "@/lib/toothCodes";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Past {
  date: string;
  procedures: string;
}

/** A procedure of the visit and the teeth it was done on ("16, 26"). */
export interface ProcedureTeeth {
  serviceName?: string;
  teeth?: string | null;
}

interface Props {
  /** The visit's procedures, each with its teeth. */
  procedures: ProcedureTeeth[];
  /** The record's Tooth No. as saved ("16, 26"): every tooth of the visit, including any
   * saved before procedures had teeth (shown as "procedure not recorded"). */
  value: string;
  /** Each tooth's chart codes ({ "16": ["D", "Am"] }); see lib/toothCodes. */
  codes?: ToothCodes;
  /** A note on a tooth ({ "16": "Sensitive to cold" }). */
  notes?: ToothNotes;
  /** Leave out for a chart that only shows. Gets the procedures with their teeth, the
   * visit's teeth to save as Tooth No., the chart codes and the notes. */
  onChange?: (next: { procedures: ProcedureTeeth[]; value: string; codes: ToothCodes; notes: ToothNotes }) => void;
  /** Whose earlier records to mark on the chart; none for a guest without an account. */
  patientId?: string | null;
  /** The record being edited or viewed, so it isn't counted as its own history. */
  excludeRecordId?: string;
}

type Kind = "incisor" | "canine" | "premolar" | "molar";

/** What kind of tooth an FDI number is, and how wide it is (mm, roughly) along the arch. */
function anatomy(t: number): { kind: Kind; width: number } {
  const n = t % 10;
  if (isChild(t)) {
    return n <= 2 ? { kind: "incisor", width: n === 1 ? 6.5 : 5.2 }
      : n === 3 ? { kind: "canine", width: 7 }
      : { kind: "molar", width: n === 4 ? 7.3 : 9 };
  }
  return n <= 2 ? { kind: "incisor", width: n === 1 ? 8.5 : 6.5 }
    : n === 3 ? { kind: "canine", width: 7.5 }
    : n <= 5 ? { kind: "premolar", width: 7 }
    : { kind: "molar", width: n === 6 ? 10.5 : n === 7 ? 9.5 : 8.5 };
}

/** How deep (cheek to tongue) each kind is, against its width. */
const DEPTH: Record<Kind, number> = { incisor: 0.85, canine: 1.05, premolar: 1.25, molar: 1.05 };

/** The tooth seen from above, centred on 0,0, its outer (cheek) side towards -y. */
function crown(kind: Kind, w: number, d: number): { outline: string; grooves: string } {
  const x = w / 2;
  const y = d / 2;
  switch (kind) {
    case "incisor":
      return {
        outline: `M ${-x} ${-y * 0.6} Q ${-x} ${-y} ${-x * 0.7} ${-y} L ${x * 0.7} ${-y} Q ${x} ${-y} ${x} ${-y * 0.6}
          Q ${x * 0.7} ${y} 0 ${y} Q ${-x * 0.7} ${y} ${-x} ${-y * 0.6} Z`,
        grooves: `M ${-x * 0.6} ${-y * 0.45} L ${x * 0.6} ${-y * 0.45}`,
      };
    case "canine":
      return {
        outline: `M 0 ${-y} Q ${x} ${-y * 0.7} ${x} 0 Q ${x} ${y} 0 ${y} Q ${-x} ${y} ${-x} 0 Q ${-x} ${-y * 0.7} 0 ${-y} Z`,
        grooves: `M 0 ${-y * 0.55} L 0 ${y * 0.35}`,
      };
    case "premolar":
      return {
        outline: `M 0 ${-y} C ${x * 1.1} ${-y} ${x * 1.1} ${y} 0 ${y} C ${-x * 1.1} ${y} ${-x * 1.1} ${-y} 0 ${-y} Z`,
        grooves: `M ${-x * 0.55} 0 Q 0 ${y * 0.18} ${x * 0.55} 0`,
      };
    case "molar":
      return {
        outline: `M ${-x * 0.75} ${-y} Q 0 ${-y * 1.12} ${x * 0.75} ${-y} Q ${x} ${-y} ${x} ${-y * 0.6}
          Q ${x * 1.08} 0 ${x} ${y * 0.6} Q ${x} ${y} ${x * 0.75} ${y} Q 0 ${y * 1.12} ${-x * 0.75} ${y}
          Q ${-x} ${y} ${-x} ${y * 0.6} Q ${-x * 1.08} 0 ${-x} ${-y * 0.6} Q ${-x} ${-y} ${-x * 0.75} ${-y} Z`,
        grooves: `M ${-x * 0.6} 0 L ${x * 0.6} 0 M 0 ${-y * 0.55} L 0 ${y * 0.55}`,
      };
  }
}

interface Placed {
  t: number;
  kind: Kind;
  x: number;
  y: number;
  /** Degrees to turn the tooth so its cheek side faces out of the arch. */
  turn: number;
  w: number;
  d: number;
  /** Where its number goes, just outside the arch. */
  lx: number;
  ly: number;
}

const VIEW_W = 420;
const CX = VIEW_W / 2;

/**
 * Lays one jaw's teeth along half an ellipse, front teeth in the middle and the back teeth
 * down the sides, each taking a share of the curve as wide as the tooth.
 * `teeth` runs from the patient's right back tooth to their left back tooth.
 */
function arch(teeth: number[], o: { cy: number; rx: number; ry: number; upper: boolean; span: number }): Placed[] {
  const half = teeth.length / 2;
  const sideWidth = teeth.slice(0, half).reduce((s, t) => s + anatomy(t).width, 0);
  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    // Upper jaw curves up to the front teeth; the lower one curves down to them.
    return { x: CX + o.rx * Math.cos(a), y: o.cy - (o.upper ? 1 : -1) * o.ry * Math.sin(a) };
  };
  // The curve is tighter at the front than down the sides, so each tooth gets its share
  // of the curve's length, not of its angle: front teeth would come out squashed otherwise.
  const steps = 400;
  const along: number[] = [0]; // length of curve from the midline out to each step
  for (let i = 1; i <= steps; i++) {
    const a = point(90 + (o.span * (i - 1)) / steps);
    const b = point(90 + (o.span * i) / steps);
    along.push(along[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = along[steps];
  /** Degrees from the midline at which the curve has run `len` long. */
  const angleAt = (len: number) => {
    const i = Math.max(1, along.findIndex((l) => l >= len));
    const f = (len - along[i - 1]) / (along[i] - along[i - 1] || 1);
    return (o.span * (i - 1 + f)) / steps;
  };

  const placed: Placed[] = [];
  teeth.forEach((t, i) => {
    const { kind, width } = anatomy(t);
    // How far from the midline this tooth's two edges are, as lengths of curve.
    const side = i < half ? teeth.slice(i + 1, half) : teeth.slice(half, i);
    const inner = (side.reduce((s, x) => s + anatomy(x).width, 0) / sideWidth) * total;
    const outer = inner + (width / sideWidth) * total;
    // The patient's right side is on the viewer's left: past 90°.
    const sign = i < half ? 1 : -1;
    const from = 90 + sign * angleAt(inner);
    const to = 90 + sign * angleAt(outer);
    const mid = (from + to) / 2;
    const a = point(mid);
    const ends = [point(from), point(to)];
    const chord = Math.hypot(ends[0].x - ends[1].x, ends[0].y - ends[1].y);
    // Outward is along the ellipse's normal at that point.
    const r = (mid * Math.PI) / 180;
    const nx = Math.cos(r) / o.rx;
    const ny = -(o.upper ? 1 : -1) * Math.sin(r) / o.ry;
    const len = Math.hypot(nx, ny);
    const ux = nx / len;
    const uy = ny / len;
    const w = chord * 0.94;
    const d = w * DEPTH[kind];
    placed.push({
      t, kind, x: a.x, y: a.y, w, d,
      turn: (Math.atan2(uy, ux) * 180) / Math.PI + 90,
      lx: a.x + ux * (d / 2 + 13),
      ly: a.y + uy * (d / 2 + 13),
    });
  });
  return placed;
}

const ADULT_LAYOUT = [
  ...arch(ADULT.upper, { cy: 240, rx: 165, ry: 185, upper: true, span: 95 }),
  ...arch(ADULT.lower, { cy: 305, rx: 155, ry: 180, upper: false, span: 95 }),
];
const CHILD_LAYOUT = [
  ...arch(CHILD.upper, { cy: 245, rx: 135, ry: 155, upper: true, span: 92 }),
  ...arch(CHILD.lower, { cy: 300, rx: 125, ry: 150, upper: false, span: 92 }),
];
const VIEW_H = 545;

const NO_CODES: ToothCodes = {};
const NO_NOTES: ToothNotes = {};

/** Where a procedure's teeth go when a tooth is ticked or unticked for it. */
function withTooth(list: ProcedureTeeth[], name: string, t: number, on: boolean): ProcedureTeeth[] {
  const i = list.findIndex((p) => sameName(p.serviceName, name));
  if (i >= 0) {
    const teeth = parseTeeth(list[i].teeth);
    const next = on ? [...new Set([...teeth, t])] : teeth.filter((x) => x !== t);
    return list.map((p, j) => (j === i ? { ...p, teeth: formatTeeth(next) } : p));
  }
  if (!on) return list;
  // A new procedure: into an empty row the form already has, or a row of its own.
  const blank = list.findIndex((p) => !p.serviceName?.trim());
  const added = { serviceName: name, teeth: String(t) };
  return blank >= 0 ? list.map((p, j) => (j === blank ? { ...p, ...added } : p)) : [...list, added];
}

const sameName = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Click a tooth to mark it with the dental chart's codes (its condition, restoration, surgery
 * or X-ray), drawn as the mouth looks: the upper jaw on top, the lower underneath, seen as
 * the dentist faces the patient (their right on the left). A tooth's procedures from records
 * that put them on teeth keep their colours (the same service, the same colour, on every
 * chart). Pointing at a tooth says what it has this visit and what was done before.
 */
export default function ToothChart({ procedures, value, codes = NO_CODES, notes = NO_NOTES, onChange, patientId, excludeRecordId }: Props) {
  const rawId = useId();
  const idPrefix = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const { colorOf } = useProcedureColors();
  const [records, setRecords] = useState<DentalRecord[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  // This visit, tooth by tooth: the procedures done on each, in the record's order.
  const byTooth = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const p of procedures) {
      const name = p.serviceName?.trim();
      if (!name) continue;
      for (const t of parseTeeth(p.teeth)) map.set(t, [...(map.get(t) ?? []), name]);
    }
    return map;
  }, [procedures]);
  // Teeth the record has with neither a procedure nor a code on them: saved before either.
  const loose = useMemo(
    () => parseTeeth(value).filter((t) => !byTooth.has(t) && !codes[t]?.length && !notes[t]),
    [value, byTooth, codes, notes],
  );
  const visit = useMemo(() => [...new Set([...byTooth.keys(), ...loose])], [byTooth, loose]);
  // Baby teeth when the record already has some; adult teeth otherwise.
  const [child, setChild] = useState(() => visit.some(isChild));

  useEffect(() => {
    if (!patientId) { setRecords([]); return; }
    let live = true;
    getDentalRecords({ patientId })
      .then((list) => { if (live) setRecords(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRecords([]); });
    return () => { live = false; };
  }, [patientId]);

  // Each tooth's earlier work, newest first: the procedures put on that tooth, or (records
  // from before procedures had teeth) the record's procedures.
  const history = useMemo(() => {
    const map = new Map<number, Past[]>();
    for (const r of [...records].sort((a, b) => b.date.localeCompare(a.date))) {
      if (r.id === excludeRecordId) continue;
      const all = r.treatments.map((t) => t.serviceName).filter(Boolean).join(", ") || r.diagnosis || "Procedure";
      const placed = r.treatments.some((t) => parseTeeth(t.teeth).length);
      for (const t of parseTeeth(r.toothNumber)) {
        const here = placed
          ? r.treatments.filter((x) => parseTeeth(x.teeth).includes(t)).map((x) => x.serviceName).filter(Boolean).join(", ")
          : all;
        map.set(t, [...(map.get(t) ?? []), { date: r.date, procedures: here || all }]);
      }
    }
    return map;
  }, [records, excludeRecordId]);

  /** Hand the form its procedures, codes and notes, and the visit's teeth to save as Tooth
   * No.: every tooth with a code, a note or a procedure on it. */
  const commit = (next: ProcedureTeeth[], keepLoose: number[], nextCodes: ToothCodes = codes, nextNotes: ToothNotes = notes) => {
    const teeth = [
      ...next.flatMap((p) => (p.serviceName?.trim() ? parseTeeth(p.teeth) : [])),
      ...keepLoose,
      ...Object.keys(nextCodes).map(Number),
      ...Object.keys(nextNotes).map(Number),
    ];
    onChange?.({ procedures: next, value: formatTeeth([...new Set(teeth)]), codes: nextCodes, notes: nextNotes });
  };
  /** A tooth's note as it's typed; an emptied one drops out. */
  const setNote = (t: number, text: string) => {
    const nextNotes = { ...notes };
    if (text.trim()) nextNotes[t] = text;
    else delete nextNotes[t];
    commit(procedures, loose, codes, nextNotes);
  };
  const toggleCode = (t: number, id: string, on: boolean) => commit(procedures, loose, withCode(codes, t, id, on));
  const clear = (t: number) => {
    let next = procedures;
    for (const name of byTooth.get(t) ?? []) next = withTooth(next, name, t, false);
    const nextCodes = { ...codes };
    delete nextCodes[t];
    const nextNotes = { ...notes };
    delete nextNotes[t];
    commit(next, loose.filter((x) => x !== t), nextCodes, nextNotes);
  };
  const [lastCode, setLastCode] = useState<string | null>(null);
  const openTooth = (t: number) => { setLastCode(null); setOpen(t); };

  const layout = child ? CHILD_LAYOUT : ADULT_LAYOUT;
  const pastLine = (p: Past) => `${format(parseISO(p.date), "MMM d, yyyy")}: ${p.procedures}`;
  // The procedures in use this visit, each with its teeth, for the legend and the summary.
  const inUse = procedures
    .filter((p) => p.serviceName?.trim() && parseTeeth(p.teeth).length)
    .map((p) => ({ name: p.serviceName!.trim(), teeth: parseTeeth(p.teeth) }));

  /** What a tooth has: its codes with their names, this visit's procedures, and what was
   * done before. Shown when it's pointed at, and at the top of its panel when it's tapped. */
  const details = (t: number) => {
    const here = byTooth.get(t) ?? [];
    const marks = codes[t] ?? [];
    const past = history.get(t);
    return (
      <>
        {marks.length > 0 && (
          <div>
            <p className="text-muted-foreground">Chart</p>
            {marks.map((id) => (
              <p key={id}>
                <span className="font-bold" style={{ color: groupColor(codeOf(id).group) }}>{codeOf(id).code}</span> {codeOf(id).name}
              </p>
            ))}
          </div>
        )}
        {here.length > 0 && (
          <div>
            <p className="text-muted-foreground">This visit</p>
            {here.map((name) => (
              <p key={name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: colorOf(name) }} aria-hidden /> {name}
              </p>
            ))}
          </div>
        )}
        {notes[t] && (
          <div>
            <p className="text-muted-foreground">Note</p>
            <p className="whitespace-pre-wrap break-words">{notes[t]}</p>
          </div>
        )}
        {loose.includes(t) && !here.length && <p>This visit: procedure not recorded</p>}
        {past && (
          <div>
            <p className="text-muted-foreground">Done before</p>
            {past.map((x, i) => <p key={i}>{pastLine(x)}</p>)}
          </div>
        )}
      </>
    );
  };

  const tooth = (p: Placed) => {
    const here = byTooth.get(p.t) ?? [];
    const unrecorded = loose.includes(p.t);
    const marks = codes[p.t] ?? [];
    const on = here.length > 0 || unrecorded;
    const note = notes[p.t];
    const marked = on || marks.length > 0 || !!note;
    // Coloured by what its codes are: a condition, a restoration, surgery, an X-ray, side by
    // side when it has more than one. (A procedure recorded on it the old way wins.)
    const groups = here.length ? [] : groupsOf(marks);
    const filled = here.length > 0 || groups.length > 0;
    const past = history.get(p.t);
    const shape = crown(p.kind, p.w, p.d);
    const clip = `${idPrefix}-clip-${p.t}`;
    const said = [
      here.length ? here.join(", ") : unrecorded ? "procedure not recorded" : "",
      marks.length ? marks.map((id) => `${codeOf(id).code} (${codeOf(id).name})`).join(", ") : "",
      note ? "has a note" : "",
    ].filter(Boolean).join("; ");
    const label = said ? `Tooth ${p.t}: ${said}` : `Tooth ${p.t}`;
    // Tapping opens its panel: to mark it when editing, or (on a record shown) to read what it
    // has, which on a phone or tablet is the only way to see it.
    const opens = !!onChange || !!past || marked;
    const g = (
      <g
        role="button"
        tabIndex={onChange || past || marked ? 0 : -1}
        aria-label={label}
        aria-haspopup={opens ? "dialog" : undefined}
        aria-expanded={opens ? open === p.t : undefined}
        aria-disabled={!onChange || undefined}
        aria-describedby={past || marked ? `${idPrefix}-${p.t}` : undefined}
        data-done-before={past ? "" : undefined}
        data-procedures={here.join("|") || undefined}
        data-codes={marks.join("|") || undefined}
        data-note={note ? "" : undefined}
        onClick={() => opens && openTooth(p.t)}
        onKeyDown={(e: KeyboardEvent) => { if (opens && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openTooth(p.t); } }}
        className={cn("group/tooth outline-none", opens ? "cursor-pointer" : "cursor-default")}
      >
        <g transform={`translate(${p.x} ${p.y}) rotate(${p.turn})`}>
          <clipPath id={clip}><path d={shape.outline} /></clipPath>
          <path
            d={shape.outline}
            className={cn(
              "transition-colors",
              unrecorded && !here.length ? "fill-muted-foreground/35"
                : past && !here.length ? "fill-warning/30"
                : "fill-background",
              onChange && !on && !past && "group-hover/tooth:fill-primary/10",
            )}
          />
          {/* A slice of colour for each procedure on the tooth, side by side. */}
          {here.length > 0 && (
            <g clipPath={`url(#${clip})`}>
              {here.map((name, i) => (
                <rect key={name} x={-p.w / 2 + (p.w * i) / here.length} y={-p.d} width={p.w / here.length + 0.3} height={p.d * 2}
                  fill={colorOf(name)} />
              ))}
            </g>
          )}
          {groups.length > 0 && (
            <g clipPath={`url(#${clip})`}>
              {groups.map((grp, i) => (
                <rect key={grp.group} x={-p.w / 2 + (p.w * i) / groups.length} y={-p.d} width={p.w / groups.length + 0.3} height={p.d * 2}
                  fill={grp.color} data-group={grp.group} />
              ))}
            </g>
          )}
          <path
            d={shape.outline}
            fill="none"
            className={cn(
              "stroke-[1.5] transition-colors",
              filled ? "stroke-foreground/50"
                : unrecorded ? "stroke-muted-foreground"
                : past ? "stroke-warning"
                : "stroke-muted-foreground/45",
              onChange && "group-hover/tooth:stroke-primary",
              open === p.t && "stroke-primary stroke-[2.5]",
              "group-focus-visible/tooth:stroke-ring group-focus-visible/tooth:stroke-[2.5]",
            )}
          />
          <path d={shape.grooves} fill="none" className={cn("stroke-1", on || filled ? "stroke-white/60" : "stroke-muted-foreground/30")} />
          {past && <circle cx={0} cy={0} r={2.6} className={on || filled ? "fill-white stroke-foreground/40" : "fill-warning"} />}
        </g>
        <text
          x={p.lx}
          y={p.ly}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("select-none text-[12px] font-semibold tabular-nums",
            on ? "fill-foreground" : past ? "fill-warning" : "fill-muted-foreground")}
        >
          {p.t}
        </text>
        {/* A note on the tooth: a small dot by its number. */}
        {note && <circle cx={p.lx + 10} cy={p.ly - 6} r={3} className="fill-primary stroke-background" strokeWidth={1} aria-hidden />}
      </g>
    );

    const tip = (past || marked) && (
      <TooltipContent className="z-[70] max-w-[16rem] text-xs space-y-1">
        <p className="font-semibold">Tooth {p.t}</p>
        {details(p.t)}
      </TooltipContent>
    );

    // Always the same elements, tip or not, so the open picker keeps its place on the tooth
    // as the tooth gains its first procedure.
    // The picker is placed against the tooth itself (an element on the page), inside its tooltip.
    const anchored = opens ? <PopoverAnchor asChild>{g}</PopoverAnchor> : g;
    const withTip = (
      <Tooltip open={open === p.t || !tip ? false : undefined}>
        <TooltipTrigger asChild>{anchored}</TooltipTrigger>
        {/* Out of the drawing: a page box placed inside an <svg> isn't shown at all. */}
        {tip && <TooltipPortal>{tip}</TooltipPortal>}
      </Tooltip>
    );
    if (!opens) return <g key={p.t}>{withTip}</g>;
    const last = lastCode ? codeOf(lastCode) : null;

    return (
      // Modal, so the panel takes over scrolling from the form's dialog: the wheel and a finger
      // scroll it, where the dialog would otherwise hold the page still around it.
      <Popover key={p.t} modal open={open === p.t} onOpenChange={(o) => setOpen(o ? p.t : null)}>
        {withTip}
        {/* As tall as the room on screen lets it be; it scrolls inside. */}
        <PopoverContent collisionPadding={8}
          className="z-[60] max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[26.5rem] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain p-3"
          aria-label={onChange ? `Chart codes for tooth ${p.t}` : `Tooth ${p.t}`} onOpenAutoFocus={(e) => e.preventDefault()}>
          <p className="text-sm font-semibold">Tooth {p.t}</p>
          {/* On a record that's only shown, what the tooltip says, for a tap (a phone can't point). */}
          {!onChange && (past || marked) && (
            <div className="mt-2 space-y-1.5 rounded-md bg-muted/50 p-2 text-xs" aria-label="About this tooth">{details(p.t)}</div>
          )}
          {!onChange ? (
            <div className="mt-2 flex justify-end">
              <Button type="button" size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => setOpen(null)}>Close</Button>
            </div>
          ) : (
          <>
          {/* The standard chart codes: tap to mark the tooth; the name of the one tapped or
              pointed at shows underneath. */}
          <div className="mt-2 space-y-2" aria-label="Chart codes" role="group">
            {CODE_GROUPS.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {TOOTH_CODES.filter((c) => c.group === g.group).map((c) => {
                    const pressed = marks.includes(c.id);
                    return (
                      <Hint key={c.id} label={c.name}>
                        <button
                          type="button"
                          aria-pressed={pressed}
                          aria-label={`${c.code}: ${c.name}`}
                          onClick={() => { setLastCode(c.id); toggleCode(p.t, c.id, !pressed); }}
                          onMouseEnter={() => setLastCode(c.id)}
                          onFocus={() => setLastCode(c.id)}
                          className={cn(
                            "h-8 min-w-[2.6rem] rounded-md border px-2 text-[13px] font-semibold transition-colors",
                            pressed ? "text-white" : "bg-background hover:bg-muted",
                          )}
                          style={pressed ? { background: g.color, borderColor: g.color } : { color: g.color, borderColor: `${g.color}66` }}
                        >
                          {c.code}
                        </button>
                      </Hint>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 min-h-[1.25rem] text-xs" aria-live="polite">
            {last ? (
              <>
                <span className="font-bold" style={{ color: groupColor(last.group) }}>{last.code}</span>{" "}
                <span className="text-foreground">{last.name}</span>
                <span className="text-muted-foreground">{marks.includes(last.id) ? " · marked" : ""}</span>
              </>
            ) : <span className="text-muted-foreground">Tap a code to mark the tooth; its name shows here.</span>}
          </p>
          <div className="mt-2 space-y-1">
            <Label htmlFor={`${idPrefix}-note-${p.t}`} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Note
            </Label>
            <Textarea
              id={`${idPrefix}-note-${p.t}`}
              aria-label={`Note for tooth ${p.t}`}
              value={note ?? ""}
              onChange={(e) => setNote(p.t, e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={`Anything about tooth ${p.t}, e.g. sensitive to cold`}
              className="min-h-[3.5rem] resize-y text-sm"
            />
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t pt-2">
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={!marked}
              onClick={() => clear(p.t)}>
              Clear tooth
            </Button>
            <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={() => setOpen(null)}>Done</Button>
          </div>
          </>
          )}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2 rounded-lg border p-2.5 sm:p-3" role="group" aria-label="Dental chart">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Which teeth" size="sm" value={child} onChange={setChild}
            options={[{ value: false, label: "Adult" }, { value: true, label: "Child (baby teeth)" }]} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {/* What a tooth's colour means. */}
            {CODE_GROUPS.map((g) => (
              <span key={g.group} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: g.color }} aria-hidden />{g.label}
              </span>
            ))}
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-warning bg-warning/30" aria-hidden />Done before</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="mx-auto block w-full max-w-[26rem]" aria-label={child ? "Baby teeth" : "Adult teeth"}>
          {/* Where the patient's sides and jaws are, so the chart can't be read mirrored. */}
          <g className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wider" aria-hidden>
            <text x={CX} y={VIEW_H / 2 - 32} textAnchor="middle">Upper</text>
            <text x={CX} y={VIEW_H / 2 + 40} textAnchor="middle">Lower</text>
          </g>
          <g className="fill-foreground text-[13px] font-bold uppercase tracking-wider" aria-hidden>
            <text x={6} y={18}>Right</text>
            <text x={VIEW_W - 6} y={18} textAnchor="end">Left</text>
            <text x={6} y={VIEW_H - 8}>Right</text>
            <text x={VIEW_W - 6} y={VIEW_H - 8} textAnchor="end">Left</text>
          </g>
          <g className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wider" aria-hidden>
            <text x={6} y={VIEW_H / 2 + 4}>Right</text>
            <text x={VIEW_W - 6} y={VIEW_H / 2 + 4} textAnchor="end">Left</text>
          </g>
          <line x1={CX} x2={CX} y1={VIEW_H / 2 - 18} y2={VIEW_H / 2 + 22} className="stroke-border" strokeDasharray="3 3" aria-hidden />
          {layout.map(tooth)}
        </svg>

        {/* What the tooltips say, for screen readers. */}
        <div className="sr-only">
          {[...new Set([...history.keys(), ...visit, ...Object.keys(codes).map(Number), ...Object.keys(notes).map(Number)])].map((t) => (
            <span key={t} id={`${idPrefix}-${t}`}>
              {codes[t]?.length ? `Chart: ${codes[t].map((id) => codeOf(id).name).join(", ")}. ` : ""}
              {notes[t] ? `Note: ${notes[t]}. ` : ""}
              {byTooth.get(t) ? `This visit: ${byTooth.get(t)!.join(", ")}. ` : loose.includes(t) ? "This visit: procedure not recorded. " : ""}
              {history.get(t) ? `Done before: ${history.get(t)!.map(pastLine).join("; ")}` : ""}
            </span>
          ))}
        </div>

        {/* The legend is the record: each procedure, its colour and its teeth; then the codes. */}
        {(Object.keys(codes).length > 0 || Object.keys(notes).length > 0) && (
          <ul className="space-y-1 text-xs" aria-label="Chart codes by tooth">
            {/* In chart order, as Tooth No. is. */}
            {parseTeeth([...Object.keys(codes), ...Object.keys(notes)].join(", ")).map((t) => [String(t), codes[t] ?? []] as const)
              .map(([t, ids]) => (
                <li key={t} className="flex gap-2">
                  <span className="w-6 shrink-0 font-medium tabular-nums text-foreground">{t}</span>
                  <span className="min-w-0">
                  {ids.map((id, i) => (
                    <span key={id} title={codeOf(id).name} className="font-bold" style={{ color: groupColor(codeOf(id).group) }}>
                      {i ? ", " : ""}{codeOf(id).code}
                    </span>
                  ))}
                  {notes[t] && (
                    <span className="block whitespace-pre-wrap break-words italic text-muted-foreground">{notes[t]}</span>
                  )}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {inUse.length > 0 || loose.length > 0 ? (
          <ul className="space-y-1 text-xs" aria-label="Procedures by tooth">
            {inUse.map((p) => (
              <li key={p.name} className="flex items-start gap-2">
                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: colorOf(p.name) }} aria-hidden />
                <span className="font-medium text-foreground">{p.name}</span>
                <span className="text-muted-foreground tabular-nums">{formatTeeth(p.teeth)}</span>
              </li>
            ))}
            {loose.length > 0 && (
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[2px] bg-muted-foreground/35 border border-muted-foreground" aria-hidden />
                <span className="font-medium text-foreground">Procedure not recorded</span>
                <span className="text-muted-foreground tabular-nums">{formatTeeth(loose)}</span>
              </li>
            )}
          </ul>
        ) : (onChange || (!Object.keys(codes).length && !Object.keys(notes).length)) && (
          <p className="text-xs text-muted-foreground">
            {onChange ? "Click a tooth to mark it with the chart's codes or add a note." : "No teeth recorded."}
          </p>
        )}
        {[...history.keys()].some((t) => isChild(t) === child) && (
          <p className="text-[11px] text-muted-foreground">Point at or tap a marked tooth to see what was done and when.</p>
        )}
      </div>
    </TooltipProvider>
  );
}
