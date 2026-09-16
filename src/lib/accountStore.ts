import { useSyncExternalStore } from "react";

export type PatientAccount = {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
  created: string;
  /** number of linked appointments (protects deletion) */
  appointments: number;
  /** number of linked dental records (protects deletion) */
  dentalRecords: number;
  phone?: string;
  lastLogin?: string;
  archivedAt?: string;
  archivedBy?: string;
};

const STORAGE_KEY = "ayag_patient_accounts";

const initialAccounts: PatientAccount[] = [
  { id: "A001", name: "Maria Garcia", email: "maria@email.com", status: "active", created: "2024-01-15", appointments: 4, dentalRecords: 3, phone: "0917-555-0101", lastLogin: "2024-06-10" },
  { id: "A002", name: "James Wilson", email: "james@email.com", status: "active", created: "2024-02-10", appointments: 2, dentalRecords: 1, phone: "0917-555-0102", lastLogin: "2024-06-08" },
  { id: "A003", name: "Emma Davis", email: "emma@email.com", status: "inactive", created: "2024-01-20", appointments: 0, dentalRecords: 0, phone: "0917-555-0103", lastLogin: "2024-03-02" },
  { id: "A004", name: "Robert Brown", email: "robert@email.com", status: "active", created: "2024-03-01", appointments: 1, dentalRecords: 0, phone: "0917-555-0104", lastLogin: "2024-05-21" },
  { id: "A005", name: "Lisa Anderson", email: "lisa@email.com", status: "active", created: "2024-03-05", appointments: 0, dentalRecords: 0, phone: "0917-555-0105", lastLogin: "2024-06-01" },
];

function load(): PatientAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PatientAccount[];
  } catch {}
  return initialAccounts;
}

let accounts: PatientAccount[] = load();

const listeners = new Set<() => void>();
const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts)); } catch {}
};
const emit = () => { persist(); listeners.forEach(l => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function getAccounts() {
  return accounts;
}

export function setAccountStatus(id: string, status: "active" | "inactive") {
  accounts = accounts.map(a => (a.id === id ? { ...a, status } : a));
  emit();
}

export function canDeleteAccount(a: PatientAccount) {
  return a.appointments === 0 && a.dentalRecords === 0;
}

export function deleteAccount(id: string): { ok: boolean; reason?: string } {
  const a = accounts.find(x => x.id === id);
  if (!a) return { ok: false, reason: "Account not found." };
  if (!canDeleteAccount(a)) {
    return { ok: false, reason: "This account has existing appointments or dental records and cannot be deleted." };
  }
  accounts = accounts.filter(x => x.id !== id);
  emit();
  return { ok: true };
}

/** Used by auth to block deactivated patients from logging in. */
export function isAccountActive(email: string) {
  const lower = email.toLowerCase();
  try {
    const raw = localStorage.getItem("ayag_patient_accounts_archived");
    if (raw && (JSON.parse(raw) as PatientAccount[]).some(x => x.email.toLowerCase() === lower)) return false;
  } catch {}
  const a = load().find(x => x.email.toLowerCase() === lower);
  return !a || a.status === "active";
}

export function usePatientAccounts() {
  return useSyncExternalStore(subscribe, getAccounts, getAccounts);
}

/* ---------------- Archived patient accounts ---------------- */

const ARCHIVE_KEY = "ayag_patient_accounts_archived";

function loadArchived(): PatientAccount[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) return JSON.parse(raw) as PatientAccount[];
  } catch {}
  return [];
}

let archivedAccounts: PatientAccount[] = loadArchived();

const persistArchived = () => {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archivedAccounts)); } catch {}
};

export function archivePatientAccount(id: string, archivedBy = "Super Admin") {
  const a = accounts.find(x => x.id === id);
  if (!a) return;
  accounts = accounts.filter(x => x.id !== id);
  archivedAccounts = [
    { ...a, status: "inactive", archivedAt: new Date().toISOString().slice(0, 10), archivedBy },
    ...archivedAccounts,
  ];
  persistArchived();
  emit();
}

export function restorePatientAccount(id: string) {
  const a = archivedAccounts.find(x => x.id === id);
  if (!a) return;
  const { archivedAt, archivedBy, ...rest } = a;
  archivedAccounts = archivedAccounts.filter(x => x.id !== id);
  accounts = [...accounts, { ...rest, status: "active" }];
  persistArchived();
  emit();
}

export function useArchivedPatientAccounts() {
  return useSyncExternalStore(subscribe, () => archivedAccounts, () => archivedAccounts);
}
