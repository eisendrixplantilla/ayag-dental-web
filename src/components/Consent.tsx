import { useEffect, useRef, useState, type PointerEvent } from "react";
import { format, parseISO } from "date-fns";
import { Ban, Eraser, Loader2, PenLine, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { declineConsent, getConsent, signConsent, type Consent, type ConsentForm } from "@/lib/api/consent";
import type { Appointment } from "@/lib/api/appointments";
import { formatManilaStamp } from "@/lib/formatDate";
import { printConsent } from "@/lib/printConsent";
import { useLetterhead } from "@/hooks/usePrintDocument";
import { cn } from "@/lib/utils";

/*
 * The patient's consent to the procedure: signed on screen (finger, stylus or mouse) before
 * the dentist starts the consultation, and shown, read-only and printable, wherever the
 * visit is looked at afterwards.
 */

const INK = "#111827";

/** Where the patient signs. Hands back the signature as a PNG, or null once cleared. */
export function SignaturePad({ onChange, disabled }: { onChange: (png: string | null) => void; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Sized to the box it's drawn in, at the screen's pixel density, on white: the signature
  // reads the same on a dark screen and on paper.
  const reset = () => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = Math.max(1, c.clientWidth * ratio);
    c.height = Math.max(1, c.clientHeight * ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };
  useEffect(reset, []);

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d");
    const p = at(e);
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
    // A tap is a dot.
    ctx?.lineTo(p.x + 0.1, p.y + 0.1);
    ctx?.stroke();
  };
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const p = at(e);
    ctx?.lineTo(p.x, p.y);
    ctx?.stroke();
  };
  const up = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    setEmpty(false);
    onChange(e.currentTarget.toDataURL("image/png"));
  };
  const clear = () => {
    reset();
    setEmpty(true);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <canvas
          ref={canvas}
          aria-label="Signature pad: sign here"
          role="img"
          className={cn(
            "block h-40 w-full rounded-md border-2 border-dashed border-input bg-white touch-none",
            disabled ? "opacity-60" : "cursor-crosshair",
          )}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Sign here with a finger, stylus or mouse
          </span>
        )}
        {/* The line a signature sits on, as on paper. */}
        <span className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-gray-300" aria-hidden />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clear} disabled={disabled || empty}>
          <Eraser className="mr-1 h-3.5 w-3.5" /> Clear signature
        </Button>
      </div>
    </div>
  );
}

/** The wording, paragraph by paragraph. */
function Wording({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-2 text-sm leading-relaxed text-foreground", className)}>
      {text.split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p.trim()}</p>)}
    </div>
  );
}

/** A consent once taken: how it went, the signature, the wording signed, and Print. */
export function ConsentDetails({ consent }: { consent: Consent }) {
  const clinic = useLetterhead();
  const signed = consent.status === "signed";
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={signed ? "bg-success/10 text-success border-success/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
          {signed ? "Signed" : "Declined"}
        </Badge>
        <span className="text-muted-foreground">
          {formatManilaStamp(consent.signedAt)}{consent.recordedBy ? ` · taken by ${consent.recordedBy}` : ""}
        </span>
      </div>
      {signed ? (
        <div>
          {consent.signature && (
            <img src={consent.signature} alt={`Signature of ${consent.patientName}`} className="h-20 max-w-full rounded border bg-white object-contain" />
          )}
          <p className="mt-1 font-medium">{consent.patientName}</p>
          <p className="text-xs text-muted-foreground">Patient's signature over printed name</p>
        </div>
      ) : (
        <p>The patient declined to sign.{consent.declineReason ? ` Reason: ${consent.declineReason}` : ""}</p>
      )}
      <details className="rounded-md border bg-muted/30 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Read the consent{signed ? " as signed" : ""}</summary>
        <Wording text={consent.text} className="mt-2" />
      </details>
      <Button type="button" variant="outline" size="sm" onClick={() => printConsent(consent, clinic)}>
        <Printer className="mr-2 h-4 w-4" /> Print Consent
      </Button>
    </div>
  );
}

/** "Patient Consent" in a visit's details: fetched for the appointment. */
export function ConsentSection({ appointmentId, className }: { appointmentId: string | null | undefined; className?: string }) {
  const [state, setState] = useState<{ loading: boolean; consent: Consent | null; failed?: boolean }>({ loading: true, consent: null });
  useEffect(() => {
    if (!appointmentId) { setState({ loading: false, consent: null }); return; }
    let live = true;
    setState({ loading: true, consent: null });
    getConsent(appointmentId)
      .then((d) => { if (live) setState({ loading: false, consent: d.consent }); })
      .catch(() => { if (live) setState({ loading: false, consent: null, failed: true }); });
    return () => { live = false; };
  }, [appointmentId]);

  return (
    <div className={cn("space-y-2 border-t border-border pt-3", className)} aria-label="Patient Consent" role="region">
      <p className="text-xs font-medium text-muted-foreground">Patient Consent</p>
      {state.loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : state.consent ? (
        <ConsentDetails consent={state.consent} />
      ) : (
        <p className="text-sm text-muted-foreground">{state.failed ? "Couldn't load the consent." : "No signed consent on file."}</p>
      )}
    </div>
  );
}

/**
 * The dentist hands the screen to the patient, who reads the consent, ticks that they
 * understood it, prints their name and signs. Or the patient refuses, and it's recorded as
 * declined. A signed one only shows.
 */
export function ConsentDialog({ appointment, onClose, onSaved }: {
  appointment: Appointment | null;
  onClose: () => void;
  onSaved: (consent: Consent) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ConsentForm | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [printedName, setPrintedName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    let live = true;
    setLoading(true); setForm(null); setConsent(null); setAgreed(false); setSignature(null);
    setDeclining(false); setReason(""); setPrintedName(appointment.patientName);
    getConsent(appointment.id)
      .then((d) => {
        if (!live) return;
        setForm(d.form); setConsent(d.consent);
        if (d.form) setPrintedName(d.form.patientName);
      })
      .catch((err) => { if (live) toast.error(err instanceof Error ? err.message : "Failed to load the consent form"); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [appointment]);

  const save = async (run: () => Promise<Consent>, done: string) => {
    setSaving(true);
    try {
      const saved = await run();
      toast.success(done);
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the consent");
    } finally {
      setSaving(false);
    }
  };
  const sign = () => {
    if (!appointment || !signature) return;
    save(() => signConsent(appointment.id, printedName.trim(), signature), "Consent signed. You can start the consultation.");
  };
  const decline = () => {
    if (!appointment) return;
    save(() => declineConsent(appointment.id, reason.trim()), "Recorded: the patient declined the consent.");
  };

  const signedAlready = consent?.status === "signed";
  const ready = agreed && !!printedName.trim() && !!signature;

  return (
    <Dialog open={!!appointment} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl bg-background max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Patient Consent</DialogTitle>
          <DialogDescription>
            {appointment && `${appointment.patientName} • ${appointment.service} • ${format(parseISO(appointment.date), "MMM d, yyyy")}`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : signedAlready ? (
          <>
            <ConsentDetails consent={consent!} />
            <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
          </>
        ) : form ? (
          <>
            <div className="space-y-4">
              {consent?.status === "declined" && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  The patient declined on {formatManilaStamp(consent.signedAt)}
                  {consent.declineReason ? `: ${consent.declineReason}` : ""}. They can still sign below.
                </p>
              )}
              <p className="text-sm text-muted-foreground">Hand the screen to the patient to read and sign.</p>
              <Wording text={form.text} className="max-h-64 overflow-y-auto overscroll-contain rounded-md border bg-muted/30 p-3" />

              {declining ? (
                <div className="space-y-2">
                  <Label htmlFor="consent-decline-reason">Why the patient declined (optional)</Label>
                  <Textarea id="consent-decline-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3}
                    placeholder="e.g. Wants to think it over, or to ask for a second opinion" />
                  <p className="text-xs text-muted-foreground">The consultation stays locked until the patient signs.</p>
                </div>
              ) : (
                <>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" aria-label="I have read and understood this consent" />
                    <span>I have read and understood this consent, my questions were answered, and I agree to the procedure.</span>
                  </label>
                  <div className="space-y-1.5">
                    <Label htmlFor="consent-printed-name">Patient's printed name</Label>
                    <Input id="consent-printed-name" value={printedName} onChange={(e) => setPrintedName(e.target.value)} maxLength={120} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Patient's signature</Label>
                    <SignaturePad onChange={setSignature} disabled={saving} />
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {declining ? (
                <>
                  <Button variant="outline" onClick={() => setDeclining(false)} disabled={saving}>Back</Button>
                  <Button variant="destructive" onClick={decline} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record as Declined
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeclining(true)} disabled={saving}>
                    <Ban className="mr-2 h-4 w-4" /> Patient Declined
                  </Button>
                  {/* On a phone the two share the row, under Patient Declined. */}
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Button variant="outline" className="flex-1 sm:flex-none" onClick={onClose} disabled={saving}>Cancel</Button>
                    <Button className="flex-1 gradient-primary text-primary-foreground sm:flex-none" onClick={sign} disabled={!ready || saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />} Sign Consent
                    </Button>
                  </div>
                </>
              )}
            </DialogFooter>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">The consent form couldn't be loaded.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
