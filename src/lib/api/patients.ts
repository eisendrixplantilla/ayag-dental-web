import { api, type User } from "@/contexts/AuthContext";

export interface Patient extends User {
  phone: string | null;
  address: string | null;
  age: number | null;
  gender: string | null;
  bloodType: string | null;
  allergies: string | null;
  status: "active" | "inactive";
  photoUrl: string | null;
  lastLogin: string | null;
  createdAt: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  appointmentsCount?: number;
  dentalRecordsCount?: number;
}

export interface PatientInput {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  age?: number;
  gender?: string;
  bloodType?: string;
  allergies?: string;
  photo?: string;
}

export async function getPatients(): Promise<Patient[]> {
  const data = await api<{ patients: Patient[] }>("/patients");
  return data.patients;
}

export async function getArchivedPatients(): Promise<Patient[]> {
  const data = await api<{ patients: Patient[] }>("/patients?archived=true");
  return data.patients;
}

export async function getPatient(id: string): Promise<Patient> {
  const data = await api<{ patient: Patient }>(`/patients?id=${encodeURIComponent(id)}`);
  return data.patient;
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  const data = await api<{ patient: Patient }>("/patients", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.patient;
}

export async function updatePatient(id: string, patch: Partial<PatientInput> & { status?: "active" | "inactive" }): Promise<Patient> {
  const data = await api<{ patient: Patient }>(`/patients?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.patient;
}

export async function archivePatient(id: string, archivedBy?: string): Promise<Patient> {
  const data = await api<{ patient: Patient }>(`/patients?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "archive", archivedBy }),
  });
  return data.patient;
}

export async function restorePatient(id: string): Promise<Patient> {
  const data = await api<{ patient: Patient }>(`/patients?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "restore" }),
  });
  return data.patient;
}

export async function deletePatient(id: string): Promise<void> {
  await api(`/patients?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
