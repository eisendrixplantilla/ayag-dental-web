import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getDentalRecords, type DentalRecord } from "@/lib/api/dentalRecords";
import { ADULT, CHILD, formatTeeth, isChild, parseTeeth } from "@/lib/teeth";
import Segmented from "@/components/Segmented";

interface Past {
  date: string;
  procedures: string;
}

interface Props {
  /** The record's Tooth No. as saved ("16, 26"). */
  value: string;
  /** Leave out for a chart that only shows. */
  onChange?: (value: string) => void;
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

/**
 * Click the teeth a procedure was done on, drawn as the mouth looks: the upper jaw on top,
 * the lower underneath, seen as the dentist faces the patient (their right on the left).
 * Teeth treated in the patient's earlier records are marked, and pointing at one says when
 * and what, so the dentist sees at a glance what has been done where.
 */
export default function ToothChart({ value, onChange, patientId, excludeRecordId }: Props) {
  const picked = useMemo(() => parseTeeth(value), [value]);
  const idPrefix = useId();
  const [records, setRecords] = useState<DentalRecord[]>([]);
  // Baby teeth when the record already has some; adult teeth otherwise.
  const [child, setChild] = useState(() => picked.some(isChild));

  useEffect(() => {
    if (!patientId) { setRecords([]); return; }
    let live = true;
    getDentalRecords({ patientId })
      .then((list) => { if (live) setRecords(Array.isArray(list) ? list : []); })
      .catch(() => { if (live) setRecords([]); });
    return () => { live = false; };
  }, [patientId]);

  // Each tooth's earlier work, newest first.
  const history = useMemo(() => {
    const map = new Map<number, Past[]>();
    for (const r of [...records].sort((a, b) => b.date.localeCompare(a.date))) {
      if (r.id === excludeRecordId) continue;
      const procedures = r.treatments.map((t) => t.serviceName).filter(Boolean).join(", ") || r.diagnosis || "Procedure";
      for (const t of parseTeeth(r.toothNumber)) map.set(t, [...(map.get(t) ?? []), { date: r.date, procedures }]);
    }
    return map;
  }, [records, excludeRecordId]);

  const toggle = (t: number) => {
    if (!onChange) return;
    onChange(formatTeeth(picked.includes(t) ? picked.filter((x) => x !== t) : [...picked, t]));
  };
  const onKey = (t: number) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(t); }
  };

  const layout = child ? CHILD_LAYOUT : ADULT_LAYOUT;
  const pastLine = (p: Past) => `${format(parseISO(p.date), "MMM d, yyyy")}: ${p.procedures}`;

  const tooth = (p: Placed) => {
    const on = picked.includes(p.t);
    const past = history.get(p.t);
    const shape = crown(p.kind, p.w, p.d);
    const g = (
      <g
        role="button"
        tabIndex={onChange || past ? 0 : -1}
        aria-label={`Tooth ${p.t}`}
        aria-pressed={onChange ? on : undefined}
        aria-disabled={!onChange || undefined}
        aria-describedby={past ? `${idPrefix}-${p.t}` : undefined}
        data-done-before={past ? "" : undefined}
        onClick={() => toggle(p.t)}
        onKeyDown={onKey(p.t)}
        className={cn("group/tooth outline-none", onChange ? "cursor-pointer" : past ? "cursor-help" : "cursor-default")}
      >
        <g transform={`translate(${p.x} ${p.y}) rotate(${p.turn})`}>
          <path
            d={shape.outline}
            className={cn(
              "stroke-[1.5] transition-colors",
              on ? "fill-primary stroke-primary"
                : past ? "fill-warning/30 stroke-warning"
                : "fill-background stroke-muted-foreground/45",
              onChange && !on && "group-hover/tooth:stroke-primary",
              !on && !past && onChange && "group-hover/tooth:fill-primary/10",
              "group-focus-visible/tooth:stroke-ring group-focus-visible/tooth:stroke-[2.5]",
            )}
          />
          <path d={shape.grooves} fill="none" className={cn("stroke-1", on ? "stroke-primary-foreground/60" : "stroke-muted-foreground/30")} />
          {past && <circle cx={0} cy={0} r={2.6} className={on ? "fill-primary-foreground" : "fill-warning"} />}
        </g>
        <text
          x={p.lx}
          y={p.ly}
          textAnchor="middle"
          dominantBaseline="central"
          className={cn("select-none text-[12px] font-semibold tabular-nums",
            on ? "fill-primary" : past ? "fill-warning" : "fill-muted-foreground")}
        >
          {p.t}
        </text>
      </g>
    );
    if (!past) return <g key={p.t}>{g}</g>;
    return (
      <Tooltip key={p.t}>
        <TooltipTrigger asChild>{g}</TooltipTrigger>
        {/* Out of the drawing: a page box placed inside an <svg> isn't shown at all. */}
        <TooltipPortal>
          <TooltipContent className="max-w-[16rem] text-xs">
            <p className="font-semibold">Tooth {p.t} — done before</p>
            {past.map((x, i) => <p key={i}>{pastLine(x)}</p>)}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-2 rounded-lg border p-2.5 sm:p-3" role="group" aria-label="Dental chart">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented label="Which teeth" size="sm" value={child} onChange={setChild}
            options={[{ value: false, label: "Adult" }, { value: true, label: "Child (baby teeth)" }]} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {onChange && <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />This visit</span>}
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-warning bg-warning/30" aria-hidden />Done before</span>
          </div>
        </div>

        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="mx-auto block w-full max-w-[26rem]" aria-label={child ? "Baby teeth" : "Adult teeth"}>
          {/* Where the patient's sides and jaws are, so the chart can't be read mirrored. */}
          <g className="fill-muted-foreground text-[10px] font-medium uppercase tracking-wider" aria-hidden>
            <text x={CX} y={VIEW_H / 2 - 32} textAnchor="middle">Upper</text>
            <text x={CX} y={VIEW_H / 2 + 40} textAnchor="middle">Lower</text>
            <text x={10} y={VIEW_H / 2 + 4}>Right</text>
            <text x={VIEW_W - 10} y={VIEW_H / 2 + 4} textAnchor="end">Left</text>
          </g>
          <line x1={CX} x2={CX} y1={VIEW_H / 2 - 18} y2={VIEW_H / 2 + 22} className="stroke-border" strokeDasharray="3 3" aria-hidden />
          {layout.map(tooth)}
        </svg>

        {/* What the tooltips say, for screen readers. */}
        <div className="sr-only">
          {[...history].map(([t, past]) => (
            <span key={t} id={`${idPrefix}-${t}`}>Done before: {past.map(pastLine).join("; ")}</span>
          ))}
        </div>

        <p className="text-xs text-foreground">
          <span className="font-medium">{onChange ? "This visit:" : "Teeth:"}</span>{" "}
          {picked.length ? formatTeeth(picked) : <span className="text-muted-foreground">{onChange ? "Click the teeth the procedure was done on." : "None recorded."}</span>}
        </p>
        {[...history.keys()].some((t) => isChild(t) === child) && (
          <p className="text-[11px] text-muted-foreground">Point at a marked tooth to see what was done and when.</p>
        )}
      </div>
    </TooltipProvider>
  );
}
