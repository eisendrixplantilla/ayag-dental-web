import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import type { DentalRecord } from "@/lib/api/dentalRecords";
import { followUpsDue, recordsToWrite } from "@/lib/dentistWork";

const apt = (over: Partial<Appointment>): Appointment => ({
  id: "a", patientId: "p1", patientName: "A", contact: null, email: null, dentistId: "d1", dentistName: "D",
  service: "Oral", date: "2026-10-01", time: "09:00", endTime: null, type: "online", status: "completed",
  reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient", createdAt: "", updatedAt: "",
  ...over,
} as Appointment);
const rec = (over: Partial<DentalRecord>): DentalRecord => ({
  id: "r", appointmentId: "a", patientId: "p1", patientName: "A", dentistId: "d1", dentistName: "D",
  date: "2026-10-01", diagnosis: "Caries", toothNumber: null, treatmentNotes: null, nextVisit: null,
  createdAt: "2026-10-01T00:00:00Z", treatments: [], prescriptions: [],
  ...over,
});

const TODAY = "2026-10-29";

describe("a dentist's to-dos", () => {
  it("lists finished consultations without a record, the latest finished first", () => {
    const list = recordsToWrite(
      [
        apt({ id: "a1", date: "2026-10-01" }), apt({ id: "a2", date: "2026-10-05", updatedAt: "2026-10-05T10:00:00Z" }),
        apt({ id: "a3", status: "confirmed" }), apt({ id: "a4", date: "2026-10-02", updatedAt: "2026-10-28T10:00:00Z" }),
      ],
      [rec({ appointmentId: "a1" })],
    );
    // a4 was for an earlier day but was only just marked done, so it is the newest.
    expect(list.map((a) => a.id)).toEqual(["a4", "a2"]);
  });

  it("shows a next visit within 14 days or past, from each patient's latest record, newest record first", () => {
    const due = followUpsDue([
      rec({ id: "old", date: "2026-08-01", nextVisit: "2026-09-01" }),
      rec({ id: "new", date: "2026-10-01", nextVisit: "2026-11-05" }),
      rec({ id: "far", patientId: "p2", nextVisit: "2026-12-30" }),
      rec({ id: "late", patientId: "p3", date: "2026-09-20", nextVisit: "2026-10-20" }),
    ], [], TODAY);
    expect(due.map((r) => r.id)).toEqual(["new", "late"]);
  });

  it("leaves out a patient already booked since the record, unless that was called off", () => {
    const records = [rec({ id: "r1", nextVisit: "2026-10-20" }), rec({ id: "r2", patientId: "p2", nextVisit: "2026-10-20" })];
    const due = followUpsDue(records, [
      apt({ patientId: "p1", date: "2026-11-02", status: "pending" }),
      apt({ patientId: "p2", date: "2026-11-02", status: "cancelled" }),
    ], TODAY);
    expect(due.map((r) => r.id)).toEqual(["r2"]);
  });
});
