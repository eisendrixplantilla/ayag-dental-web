import { useRef, useState } from "react";
import { Camera, Images, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MAX_PHOTOS_PER_KIND, PHOTO_LABELS, type PhotoDraft, type PhotoKind, type RecordPhoto,
} from "@/lib/api/dentalRecords";
import { formatManilaStamp } from "@/lib/formatDate";
import { shrinkPhoto } from "@/lib/shrinkPhoto";
import { useRecordPhotos } from "@/hooks/useRecordPhotos";
import { cn } from "@/lib/utils";

/*
 * Clinical photos on a dental record: what the teeth looked like before the procedure and
 * after it, side by side. Taken in the record's form (the camera on a phone or tablet, a
 * file on a PC) and seen in the record's details. Dentists only.
 */

const KINDS: { kind: PhotoKind; title: string }[] = [
  { kind: "before", title: "Before" },
  { kind: "after", title: "After" },
];

/** A phone or tablet: one that has a camera to offer, and a finger rather than a mouse. */
const isTouch = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

/** The Photos section of a record's form. New photos stay in the form until it's saved. */
export function PhotoEditor({ photos, onChange, disabled }: {
  photos: PhotoDraft[];
  onChange: (next: PhotoDraft[]) => void;
  disabled?: boolean;
}) {
  const album = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const adding = useRef<PhotoKind>("before");
  const [busy, setBusy] = useState<PhotoKind | null>(null);
  const [touch] = useState(isTouch);
  // The latest list, for photos that finish shrinking after it has changed.
  const latest = useRef(photos);
  latest.current = photos;

  const pick = (kind: PhotoKind, from: "album" | "camera") => {
    adding.current = kind;
    (from === "camera" ? camera : album).current?.click();
  };

  const add = async (files: FileList | null) => {
    const kind = adding.current;
    const room = MAX_PHOTOS_PER_KIND - latest.current.filter((p) => p.kind === kind).length;
    const chosen = Array.from(files ?? []);
    if (chosen.length === 0) return;
    if (chosen.length > room) toast.error(`Up to ${MAX_PHOTOS_PER_KIND} ${kind} photos. ${room > 0 ? `Only the first ${room} were added.` : ""}`);
    setBusy(kind);
    try {
      for (const file of chosen.slice(0, Math.max(0, room))) {
        const image = await shrinkPhoto(file);
        onChange([...latest.current, { kind, label: null, image }]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the photo.");
    } finally {
      setBusy(null);
    }
  };

  const update = (i: number, patch: Partial<PhotoDraft>) => onChange(photos.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const remove = (i: number) => onChange(photos.filter((_, j) => j !== i));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* The album takes several at once; the camera opens straight away, one shot at a time. */}
      <input
        ref={album}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-hidden
        tabIndex={-1}
        data-testid="photo-album"
        onChange={(e) => { void add(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        data-testid="photo-camera"
        onChange={(e) => { void add(e.target.files); e.target.value = ""; }}
      />
      {KINDS.map(({ kind, title }) => {
        const mine = photos.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === kind);
        const full = mine.length >= MAX_PHOTOS_PER_KIND;
        const button = (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={touch ? undefined : () => pick(kind, "album")}
            disabled={disabled || full || busy !== null}
          >
            {busy === kind ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
            Add {title} Photo
          </Button>
        );
        return (
          <div key={kind} className="space-y-2 rounded-md border border-border p-3" role="group" aria-label={`${title} photos`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{title} <span className="font-normal text-muted-foreground">({mine.length}/{MAX_PHOTOS_PER_KIND})</span></p>
              {/* A phone asks where from; a PC has no camera to offer, so it goes straight to the files. */}
              {touch ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={() => pick(kind, "camera")}>
                      <Camera className="mr-2 h-4 w-4" /> Take Photo
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => pick(kind, "album")}>
                      <Images className="mr-2 h-4 w-4" /> Choose from Album
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : button}
            </div>
            {mine.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {kind === "before" ? "Take it before starting the procedure." : "Take it once the procedure is done."}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {mine.map(({ p, i }, n) => (
                  <li key={p.id ?? `${kind}-${i}`} className="space-y-1">
                    <div className="relative">
                      <img src={p.image} alt={`${title} photo ${n + 1}${p.label ? `, ${p.label}` : ""}`} className="aspect-[4/3] w-full rounded border bg-muted object-cover" />
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        disabled={disabled}
                        aria-label={`Remove ${kind} photo ${n + 1}`}
                        className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <select
                      value={p.label ?? ""}
                      onChange={(e) => update(i, { label: e.target.value || null })}
                      disabled={disabled}
                      aria-label={`Label for ${kind} photo ${n + 1}`}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="">No label</option>
                      {PHOTO_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** "Photos" in a record's details: before and after side by side; a photo opens large. */
export function PhotoGallery({ recordId, className }: { recordId: string; className?: string }) {
  const { loading, photos, failed } = useRecordPhotos(recordId);
  const [open, setOpen] = useState<RecordPhoto | null>(null);

  return (
    <div className={cn("space-y-2", className)} role="region" aria-label="Photos">
      <p className="text-xs font-medium text-muted-foreground">Photos</p>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{failed ? "Couldn't load the photos." : "No photos taken."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {KINDS.map(({ kind, title }) => {
            const mine = photos.filter((p) => p.kind === kind);
            return (
              <div key={kind} className="min-w-0 space-y-1.5">
                <p className="text-sm font-medium">{title}</p>
                {mine.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {mine.map((p, n) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => setOpen(p)} className="block w-full text-left" aria-label={`Open ${kind} photo ${n + 1}${p.label ? `, ${p.label}` : ""}`}>
                          <img src={p.image} alt="" className="aspect-[4/3] w-full rounded border bg-muted object-cover hover:opacity-90" />
                          {p.label && <span className="mt-0.5 block text-xs text-muted-foreground">{p.label}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl bg-background">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {open && `${open.kind === "before" ? "Before" : "After"}${open.label ? ` · ${open.label}` : ""}`}
            </DialogTitle>
            <DialogDescription>
              {open && `Taken ${formatManilaStamp(open.takenAt)}${open.takenBy ? ` by ${open.takenBy}` : ""}`}
            </DialogDescription>
          </DialogHeader>
          {open && <img src={open.image} alt={`${open.kind} photo${open.label ? `, ${open.label}` : ""}`} className="max-h-[70vh] w-full rounded object-contain bg-muted" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
