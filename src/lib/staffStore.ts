import { useSyncExternalStore } from "react";

export type StaffRole = "admin" | "dentist";

export type Staff = {
  /** Employee ID — cannot be edited once created */
  id: string;
  name: string;
  email: string;
  contact: string;
  username: string;
  role: StaffRole;
  status: string;
  joined: string;
  archivedAt?: string;
  archivedBy?: string;
};

const STORAGE_KEY = "ayag_staff_accounts";

const initialActive: Staff[] = [
  { id: "EMP-001", name: "Dr. Sarah Chen", email: "sarah@ayagdental.com", contact: "0917-555-0201", username: "schen", role: "admin", status: "active", joined: "2023-01-15" },
  { id: "EMP-002", name: "Dr. Mike Johnson", email: "mike@ayagdental.com", contact: "0917-555-0202", username: "mjohnson", role: "dentist", status: "active", joined: "2023-03-20" },
  { id: "EMP-003", name: "Nurse Amy Lee", email: "amy@ayagdental.com", contact: "0917-555-0203", username: "alee", role: "admin", status: "active", joined: "2023-06-10" },
  { id: "EMP-004", name: "Receptionist Jen Cruz", email: "jen@ayagdental.com", contact: "0917-555-0204", username: "jcruz", role: "admin", status: "inactive", joined: "2023-09-01" },
  { id: "EMP-005", name: "Dr. Ayag", email: "ayag@ayagdental.com", contact: "0917-555-0205", username: "dayag", role: "dentist", status: "active", joined: "2022-05-04" },
  { id: "EMP-006", name: "Dr. Santos", email: "santos@ayagdental.com", contact: "0917-555-0206", username: "dsantos", role: "dentist", status: "active", joined: "2023-02-11" },
];

type State = { active: Staff[]; archived: Staff[] };

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {}
  return { active: initialActive, archived: [] };
}

let state: State = load();

const listeners = new Set<() => void>();
const emit = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  listeners.forEach(l => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function nextEmployeeId() {
  const nums = [...state.active, ...state.archived]
    .map(s => Number(s.id.replace(/\D/g, "")))
    .filter(n => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `EMP-${String(next).padStart(3, "0")}`;
}

export function addStaff(s: Omit<Staff, "id" | "joined"> & { id?: string; joined?: string }) {
  const staff: Staff = {
    ...s,
    id: s.id ?? nextEmployeeId(),
    joined: s.joined ?? new Date().toISOString().slice(0, 10),
  };
  state = { ...state, active: [...state.active, staff] };
  emit();
  return staff;
}

export function updateStaff(id: string, patch: Partial<Omit<Staff, "id">>) {
  state = { ...state, active: state.active.map(s => (s.id === id ? { ...s, ...patch } : s)) };
  emit();
}

export function archiveStaff(id: string, archivedBy = "Super Admin") {
  const s = state.active.find(x => x.id === id);
  if (!s) return;
  state = {
    active: state.active.filter(x => x.id !== id),
    archived: [{ ...s, status: "archived", archivedAt: new Date().toISOString().slice(0, 10), archivedBy }, ...state.archived],
  };
  emit();
}

export function restoreStaff(id: string) {
  const s = state.archived.find(x => x.id === id);
  if (!s) return;
  const { archivedAt, ...rest } = s;
  state = {
    archived: state.archived.filter(x => x.id !== id),
    active: [...state.active, { ...rest, status: "active" }],
  };
  emit();
}

export function useActiveStaff() {
  return useSyncExternalStore(subscribe, () => state.active, () => state.active);
}

export function useArchivedStaff() {
  return useSyncExternalStore(subscribe, () => state.archived, () => state.archived);
}

/** Active + archived accounts — used for duplicate checks. */
export function getAllStaff() {
  return [...state.active, ...state.archived];
}
