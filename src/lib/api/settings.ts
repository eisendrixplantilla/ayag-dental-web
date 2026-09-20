import { api } from "@/contexts/AuthContext";

export interface ClinicHourEntry {
  day: string;
  open: string;
  close: string;
  enabled: boolean;
}

export interface ClinicInfo {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export async function getClinicHours(): Promise<ClinicHourEntry[]> {
  const data = await api<{ hours: ClinicHourEntry[] }>("/staff?clinicHours=true");
  return data.hours;
}

export async function updateClinicHours(hours: ClinicHourEntry[]): Promise<void> {
  await api("/staff?clinicHours=true", {
    method: "PUT",
    body: JSON.stringify({ hours }),
  });
}

export async function getClinicInfo(): Promise<ClinicInfo> {
  const data = await api<{ info: ClinicInfo }>("/staff?clinicInfo=true");
  return data.info;
}

export async function updateClinicInfo(patch: Partial<ClinicInfo>): Promise<ClinicInfo> {
  const data = await api<{ info: ClinicInfo }>("/staff?clinicInfo=true", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
  return data.info;
}
