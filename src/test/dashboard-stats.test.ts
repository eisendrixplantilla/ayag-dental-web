import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import {
  appointmentBars, distinctPatients, firstVisits, joinedSummary, monthlySuccess, percentChange, previousPeriod, successRate, topTreatments,
} from "@/lib/dashboardStats";

const apt = (over: Partial<Appointment>): Appointment => ({
  id: "x", patientId: "p1", patientName: "A", contact: null, email: null, dentistId: "d1", dentistName: "D",
  service: "Oral", date: "2026-10-10", time: "09:00", endTime: null, type: "online", status: "confirmed",
  reason: null, remarks: null, rescheduleCount: 0, createdBy: "patient", createdAt: "", updatedAt: "",
  ...over,
} as Appointment);

describe("dashboard numbers", () => {
  it("compares a month with the month before, and a range with as many days before it", () => {
    expect(previousPeriod({ kind: "month", month: "2026-01" })).toEqual({ kind: "month", month: "2025-12" });
    expect(previousPeriod({ kind: "range", from: "2026-10-11", to: "2026-10-20" }))
      .toEqual({ kind: "range", from: "2026-10-01", to: "2026-10-10" });
    expect(previousPeriod({ kind: "all" })).toBeNull();
  });

  it("gives a whole-percent change, and none from zero", () => {
    expect(percentChange(11, 10)).toBe(10);
    expect(percentChange(8, 10)).toBe(-20);
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(5, null)).toBeNull();
  });

  it("counts each patient once, guests by name and number", () => {
    expect(distinctPatients([
      apt({ patientId: "p1" }), apt({ patientId: "p1" }),
      apt({ patientId: null, patientName: "Jose", contact: "0917 123" }), apt({ patientId: null, patientName: "jose ", contact: "0917123" }),
      apt({ patientId: null, patientName: "Jose", contact: "0999" }),
    ])).toBe(3);
  });

  it("rates only what came due, completed out of all", () => {
    const list = [
      apt({ status: "completed", date: "2026-10-01" }), apt({ status: "cancelled", date: "2026-10-02" }),
      apt({ status: "pending", date: "2026-10-30" }),
    ];
    expect(successRate(list, "2026-10-15")).toBe(50);
    expect(successRate([], "2026-10-15")).toBeNull();
    expect(monthlySuccess(list, "2026-10-15", 2)).toEqual([{ label: "Sep", rate: null }, { label: "Oct", rate: 50 }]);
  });

  it("bars the last 8 weeks, 9 months or 5 years, ending with the current one", () => {
    const list = [apt({ date: "2026-10-10", status: "completed" }), apt({ date: "2026-09-03" })];
    const months = appointmentBars(list, "monthly", "2026-10-29");
    expect(months).toHaveLength(9);
    expect(months.at(-1)).toEqual({ label: "Oct", appointments: 1, completed: 1 });
    expect(months.at(-2)).toEqual({ label: "Sep", appointments: 1, completed: 0 });
    expect(appointmentBars(list, "weekly", "2026-10-29")).toHaveLength(8);
    expect(appointmentBars(list, "yearly", "2026-10-29").map((b) => b.label)).toEqual(["2022", "2023", "2024", "2025", "2026"]);
  });

  it("folds everything past the top three into Others", () => {
    expect(topTreatments([{ name: "A", count: 5 }, { name: "B", count: 4 }, { name: "C", count: 3 }, { name: "D", count: 2 }, { name: "E", count: 1 }]))
      .toEqual([{ name: "A", count: 5 }, { name: "B", count: 4 }, { name: "C", count: 3 }, { name: "Others", count: 3 }]);
  });

  it("dates each patient from their first visit, and guests apart from accounts", () => {
    const list = [
      apt({ patientId: "p1", date: "2026-10-05" }), apt({ patientId: "p1", date: "2026-08-01" }),
      apt({ patientId: null, patientName: "Jose", contact: "0917", date: "2026-10-02" }),
    ];
    expect(firstVisits(list)).toEqual([{ date: "2026-08-01", account: true }, { date: "2026-10-02", account: false }]);
    expect(firstVisits(list, true)).toEqual([{ date: "2026-10-02", account: false }]);
  });

  it("sums the month, the month before, accounts and guests, and six months of trend", () => {
    const sum = joinedSummary([
      { date: "2026-10-01", account: true }, { date: "2026-10-20", account: false },
      { date: "2026-09-03", account: true }, { date: "2025-01-01", account: true },
    ], "2026-10-29");
    expect(sum).toMatchObject({ month: 2, previous: 1, previousLabel: "Sep", all: 4, accounts: 3, guests: 1 });
    expect(sum.trend.map((t) => t.label)).toEqual(["May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(sum.trend.at(-1)!.count).toBe(2);
  });
});
