import { api } from "@/contexts/AuthContext";

export interface StaffMember {
  id: string;
  employeeId: string | null;
  name: string;
  email: string;
  contact: string | null;
  role: "admin" | "dentist";
  status: string;
  createdAt: string | null;
}

export interface StaffInput {
  employeeId?: string;
  name: string;
  email: string;
  contact?: string;
  role: "admin" | "dentist";
  password: string;
}

export interface StaffUpdate {
  name?: string;
  email?: string;
  contact?: string;
  password?: string;
  status?: string;
}

export async function getStaff(): Promise<StaffMember[]> {
  const data = await api<{ staff: StaffMember[] }>("/staff");
  return data.staff;
}

export async function getArchivedStaff(): Promise<StaffMember[]> {
  const data = await api<{ staff: StaffMember[] }>("/staff?archived=true");
  return data.staff;
}

export async function getStaffMember(id: string): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`);
  return data.staff;
}

export async function createStaff(input: StaffInput): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>("/staff", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.staff;
}

export async function updateStaff(id: string, patch: StaffUpdate): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.staff;
}

export async function archiveStaff(id: string): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "archive" }),
  });
  return data.staff;
}

export async function restoreStaff(id: string): Promise<StaffMember> {
  const data = await api<{ staff: StaffMember }>(`/staff?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ action: "restore" }),
  });
  return data.staff;
}
