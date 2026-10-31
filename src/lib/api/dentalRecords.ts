import { api } from "@/contexts/AuthContext";

export interface TreatmentEntry {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  /** The teeth this procedure was done on ("16, 26"); null on records from before. */
  teeth?: string | null;
}

export interface PrescriptionEntry {
  id: string;
  medicine: string;
  dosage: string | null;
  instructions: string | null;
}

export interface DentalRecord {
  id: string;
  appointmentId: string;
  patientId: string | null;
  patientName: string | null;
  dentistId: string | null;
  dentistName: string | null;
  date: string;
  diagnosis: string;
  toothNumber: string | null;
  /** The dental chart's codes per tooth ({ "16": ["D", "Am"] }); see lib/toothCodes. */
  toothCodes?: Record<string, string[]>;
  /** A note on a tooth ({ "16": "Sensitive to cold" }). */
  toothNotes?: Record<string, string>;
  treatmentNotes: string | null;
  nextVisit: string | null;
  createdAt: string;
  treatments: TreatmentEntry[];
  prescriptions: PrescriptionEntry[];
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  duration: number | null;
  price: number | null;
  /** Where the service sits in the catalogue, as the Super Admin arranged it. */
  sortOrder?: number | null;
  /** Set once a service is taken out of the catalogue; records that used it keep its name. */
  removedAt?: string | null;
  removedBy?: string | null;
  removedReason?: string | null;
}

export interface TreatmentInput {
  serviceId?: string;
  serviceName?: string;
  /** The teeth this procedure was done on ("16, 26"). */
  teeth?: string;
}

export interface PrescriptionInput {
  medicine: string;
  dosage?: string;
  instructions?: string;
}

export interface DentalRecordInput {
  appointmentId: string;
  date?: string;
  diagnosis: string;
  toothNumber?: string;
  toothCodes?: Record<string, string[]>;
  toothNotes?: Record<string, string>;
  treatmentNotes?: string;
  nextVisit?: string;
  treatments?: TreatmentInput[];
  prescriptions?: PrescriptionInput[];
}

export interface DentalRecordUpdate {
  diagnosis?: string;
  toothNumber?: string;
  toothCodes?: Record<string, string[]>;
  toothNotes?: Record<string, string>;
  treatmentNotes?: string;
  nextVisit?: string;
  treatments?: TreatmentInput[];
  prescriptions?: PrescriptionInput[];
}

export async function getDentalRecords(filters: { patientId?: string } = {}): Promise<DentalRecord[]> {
  const params = new URLSearchParams(filters as Record<string, string>);
  const query = params.toString();
  const data = await api<{ records: DentalRecord[] }>(`/dental-records${query ? `?${query}` : ""}`);
  return data.records;
}

export async function getDentalRecord(id: string): Promise<DentalRecord> {
  const data = await api<{ record: DentalRecord }>(`/dental-records?id=${encodeURIComponent(id)}`);
  return data.record;
}

export async function getServices(): Promise<Service[]> {
  const data = await api<{ services: Service[] }>("/dental-records?services=true");
  return data.services;
}

export interface ServiceInput {
  name: string;
  duration?: number;
  price?: number;
  description?: string;
}

export async function createService(input: ServiceInput): Promise<Service> {
  const data = await api<{ service: Service }>("/dental-records?services=true", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.service;
}

/** The services no longer offered, newest removal first. */
export async function getRemovedServices(): Promise<Service[]> {
  const data = await api<{ services: Service[] }>("/dental-records?services=true&removed=true");
  return data.services;
}

/** `reason` is required — the catalogue records why a service stopped being offered. */
export async function removeService(id: string, reason: string, removedBy?: string): Promise<Service> {
  const data = await api<{ service: Service }>(`/dental-records?services=true&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "remove", reason, removedBy }),
  });
  return data.service;
}

export async function restoreService(id: string): Promise<Service> {
  const data = await api<{ service: Service }>(`/dental-records?services=true&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "restore" }),
  });
  return data.service;
}

/** Saves the catalogue's order, given the service ids in the order they should read.
 * Returns the list as it now stands, so the page and the database can't disagree. */
export async function reorderServices(order: string[]): Promise<Service[]> {
  const data = await api<{ services: Service[] }>("/dental-records?services=true", {
    method: "PATCH",
    body: JSON.stringify({ action: "reorder", order }),
  });
  return data.services;
}

/** A dental record standing in the way of deleting a service, as the server names it. */
export interface BlockingRecord {
  id: string;
  date: string | null;
  diagnosis: string;
  patientName: string | null;
}

/** Takes a removed service out of the catalogue for good. The server refuses while a
 * dental record names it, and says which — `withRecords` deletes those records too,
 * which is only ever asked for once the Super Admin has seen the list. */
export async function deleteService(id: string, withRecords = false): Promise<void> {
  const cascade = withRecords ? "&withRecords=true" : "";
  await api(`/dental-records?services=true&id=${encodeURIComponent(id)}${cascade}`, { method: "DELETE" });
}

export async function updateService(id: string, patch: { price?: number; duration?: number }): Promise<Service> {
  const data = await api<{ service: Service }>(`/dental-records?services=true&id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.service;
}

export async function createDentalRecord(input: DentalRecordInput): Promise<DentalRecord> {
  const data = await api<{ record: DentalRecord }>("/dental-records", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.record;
}

export async function updateDentalRecord(id: string, patch: DentalRecordUpdate): Promise<DentalRecord> {
  const data = await api<{ record: DentalRecord }>(`/dental-records?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.record;
}

/** A clinical photo on a record, before or after the procedure. Dentists only. */
export type PhotoKind = "before" | "after";
export const PHOTO_LABELS = ["Front", "Upper", "Lower", "Left", "Right"] as const;
export const MAX_PHOTOS_PER_KIND = 6;

export interface RecordPhoto {
  id: string;
  recordId: string;
  kind: PhotoKind;
  label: string | null;
  /** A JPEG data URL. */
  image: string;
  takenBy: string | null;
  takenAt: string;
}

/** A photo in a form: one already saved has its id; a new one has none until it's saved. */
export interface PhotoDraft {
  id?: string;
  kind: PhotoKind;
  label: string | null;
  image: string;
}

export async function getRecordPhotos(recordId: string): Promise<RecordPhoto[]> {
  const data = await api<{ photos: RecordPhoto[] }>(`/dental-records?photos=${encodeURIComponent(recordId)}`);
  return data.photos ?? [];
}

/**
 * Brings a record's photos in line with the form: the saved ones taken off are deleted, the
 * relabelled ones relabelled, and the new ones uploaded, one at a time (each is a few hundred
 * KB). Throws on the first that fails, so the caller can say the record saved but a photo didn't.
 */
export async function savePhotos(recordId: string, photos: PhotoDraft[], before: PhotoDraft[] = []): Promise<void> {
  const now = new Map(photos.filter((p) => p.id).map((p) => [p.id, p]));
  for (const p of before) {
    if (!p.id) continue;
    const kept = now.get(p.id);
    const path = `/dental-records?photo=${encodeURIComponent(p.id)}`;
    if (!kept) await api(path, { method: "DELETE" });
    else if (kept.label !== p.label) await api(path, { method: "PATCH", body: JSON.stringify({ label: kept.label }) });
  }
  for (const p of photos) {
    if (p.id) continue;
    await api("/dental-records?photos=true", {
      method: "POST",
      body: JSON.stringify({ recordId, kind: p.kind, label: p.label, image: p.image }),
    });
  }
}
