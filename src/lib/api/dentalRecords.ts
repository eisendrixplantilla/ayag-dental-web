import { api } from "@/contexts/AuthContext";

export interface TreatmentEntry {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
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
  /** Set once a service is taken out of the catalogue; records that used it keep its name. */
  removedAt?: string | null;
  removedBy?: string | null;
  removedReason?: string | null;
}

export interface TreatmentInput {
  serviceId?: string;
  serviceName?: string;
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
  treatmentNotes?: string;
  nextVisit?: string;
  treatments?: TreatmentInput[];
  prescriptions?: PrescriptionInput[];
}

export interface DentalRecordUpdate {
  diagnosis?: string;
  toothNumber?: string;
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
