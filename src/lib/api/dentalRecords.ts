import { api } from "@/contexts/AuthContext";

export interface DentalRecord {
  id: string;
  appointmentId: string | null;
  patientId: string | null;
  patientName: string;
  dentistId: string | null;
  dentistName: string | null;
  date: string;
  service: string | null;
  procedure: string;
  diagnosis: string;
  toothNumber: string | null;
  treatmentNotes: string | null;
  prescription: string | null;
  nextVisit: string | null;
  createdAt: string;
}

export interface DentalRecordAudit {
  id: string;
  recordId: string;
  editedAt: string;
  reason: string;
  changes: string;
}

export interface DentalRecordInput {
  appointmentId?: string;
  patientId?: string;
  patientName: string;
  dentistId?: string;
  dentistName?: string;
  date: string;
  service?: string;
  procedure: string;
  diagnosis: string;
  toothNumber?: string;
  treatmentNotes?: string;
  prescription?: string;
  nextVisit?: string;
}

export interface DentalRecordCorrection {
  reason: string;
  diagnosis?: string;
  procedure?: string;
  toothNumber?: string;
  treatmentNotes?: string;
  prescription?: string;
  nextVisit?: string;
}

export async function getDentalRecords(filters: { patientId?: string; dentistName?: string } = {}): Promise<DentalRecord[]> {
  const params = new URLSearchParams(filters as Record<string, string>);
  const query = params.toString();
  const data = await api<{ records: DentalRecord[] }>(`/dental-records${query ? `?${query}` : ""}`);
  return data.records;
}

export async function getDentalRecord(id: string): Promise<{ record: DentalRecord; audits: DentalRecordAudit[] }> {
  return api(`/dental-records?id=${encodeURIComponent(id)}`);
}

export async function createDentalRecord(input: DentalRecordInput): Promise<DentalRecord> {
  const data = await api<{ record: DentalRecord }>("/dental-records", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.record;
}

export async function correctDentalRecord(id: string, correction: DentalRecordCorrection): Promise<{ record: DentalRecord; audits: DentalRecordAudit[] }> {
  return api(`/dental-records?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(correction),
  });
}
