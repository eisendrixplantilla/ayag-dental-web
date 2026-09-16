import { useSyncExternalStore } from "react";

export type AptStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "rescheduled";

export type DentistAppointment = {
  id: number;
  patient: string;
  contact: string;
  email: string;
  service: string;
  dentist: string;
  date: string; // yyyy-MM-dd
  time: string; // HH:mm (24h)
  type: "online" | "walk-in";
  status: AptStatus;
  reason?: string;
  remarks?: string;
};

export type DentalRecordAudit = {
  editedAt: string;
  reason: string;
  changes: string;
};

export type DentalRecord = {
  id: string;
  appointmentId?: number;
  patient: string;
  dentist: string;
  date: string;
  service: string;
  procedure: string;
  diagnosis: string;
  toothNumber?: string;
  treatmentNotes: string;
  prescription: string;
  nextVisit?: string;
  audit?: DentalRecordAudit[];
};

const iso = (d: Date) => d.toISOString().split("T")[0];
const today = iso(new Date());
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
};

let appointments: DentistAppointment[] = [
  { id: 1, patient: "Maria Garcia", contact: "0917 555 0101", email: "maria.garcia@email.com", service: "Tooth Extraction", dentist: "Dr. Mike Johnson", date: today, time: "09:00", type: "online", status: "completed" },
  { id: 2, patient: "James Wilson", contact: "0917 555 0102", email: "james.wilson@email.com", service: "Dental Cleaning", dentist: "Dr. Mike Johnson", date: today, time: "10:30", type: "online", status: "confirmed" },
  { id: 3, patient: "Emma Davis", contact: "0917 555 0103", email: "emma.davis@email.com", service: "Root Canal", dentist: "Dr. Mike Johnson", date: today, time: "11:00", type: "walk-in", status: "confirmed" },
  { id: 4, patient: "Carlo Reyes", contact: "0917 555 0104", email: "carlo.reyes@email.com", service: "Check-up", dentist: "Dr. Mike Johnson", date: today, time: "13:00", type: "walk-in", status: "pending" },
  { id: 5, patient: "Ana Santos", contact: "0917 555 0105", email: "ana.santos@email.com", service: "Teeth Whitening", dentist: "Dr. Mike Johnson", date: addDays(1), time: "14:30", type: "online", status: "confirmed" },
  { id: 6, patient: "Juan Dela Cruz", contact: "0917 555 0106", email: "juan.delacruz@email.com", service: "Filling", dentist: "Dr. Mike Johnson", date: addDays(2), time: "10:00", type: "online", status: "confirmed" },
  { id: 7, patient: "Pedro Reyes", contact: "0917 555 0107", email: "pedro.reyes@email.com", service: "EXO (Bunot)", dentist: "Dr. Mike Johnson", date: addDays(-1), time: "09:00", type: "walk-in", status: "completed" },
];

let records: DentalRecord[] = [];

const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export function useDentistAppointments() {
  return useSyncExternalStore(subscribe, () => appointments, () => appointments);
}

export function useDentalRecords() {
  return useSyncExternalStore(subscribe, () => records, () => records);
}

export function rescheduleAppointment(
  id: number,
  data: { date: string; time: string; reason: string; remarks?: string },
) {
  appointments = appointments.map(a =>
    a.id === id ? { ...a, date: data.date, time: data.time, status: "rescheduled", reason: data.reason, remarks: data.remarks } : a,
  );
  emit();
}

export function cancelAppointment(id: number, reason: string, remarks?: string) {
  appointments = appointments.map(a =>
    a.id === id ? { ...a, status: "cancelled", reason, remarks } : a,
  );
  emit();
}

export function completeConsultation(id: number, record: Omit<DentalRecord, "id" | "appointmentId">) {
  records = [{ ...record, id: `DR-${Date.now()}`, appointmentId: id }, ...records];
  appointments = appointments.map(a => (a.id === id ? { ...a, status: "completed" } : a));
  emit();
}

export function createDentalRecord(record: Omit<DentalRecord, "id">) {
  records = [{ ...record, id: `DR-${Date.now()}` }, ...records];
  emit();
}

export function correctDentalRecord(
  id: string,
  changes: Partial<Pick<DentalRecord, "diagnosis" | "procedure" | "toothNumber" | "treatmentNotes" | "prescription" | "nextVisit">>,
  reason: string,
) {
  records = records.map(r => {
    if (r.id !== id) return r;
    const changeSummary = Object.entries(changes)
      .map(([field, value]) => `${field}: "${r[field as keyof DentalRecord] ?? ""}" → "${value ?? ""}"`)
      .join("; ");
    return {
      ...r,
      ...changes,
      audit: [
        ...(r.audit ?? []),
        { editedAt: new Date().toISOString(), reason, changes: changeSummary },
      ],
    };
  });
  emit();
}
