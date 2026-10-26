import { describe, expect, it } from "vitest";
import type { Appointment } from "@/lib/api/appointments";
import {
  byDentist, byService, countByStatus, inPeriod, overTime, periodBounds, periodLabel, STATUSES,
} from "@/lib/reportPeriod";

const apt = (date: string, status: Appointment["status"], over: Partial<Appointment> = {}): Appointment => ({
  id: `${date}-${status}`, patientId: null, patientName: "P", contact: null, email: null, age: null, gender: null,
  dentistId: null, dentistName: "Aerhol Gocalin", service: "Oral", date, time: "09:00", endTime: null,
  type: "online", status, reason: null, remarks: null, rescheduleCount: 0, createdBy: null,
  createdAt: "", updatedAt: "", ...over,
});

describe("the period the Reports page counts over", () => {
  it("covers a whole month", () => {
    expect(periodBounds({ kind: "month", month: "2026-02" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodLabel({ kind: "month", month: "2026-10" })).toBe("October 2026");
  });

  it("covers a range, either way round, and reads it back", () => {
    expect(periodBounds({ kind: "range", from: "2026-10-15", to: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-15" });
    expect(periodLabel({ kind: "range", from: "2026-10-01", to: "2026-10-15" })).toBe("Oct 1 – Oct 15, 2026");
    expect(periodLabel({ kind: "range", from: "2026-10-05", to: "2026-10-05" })).toBe("Oct 5, 2026");
    expect(periodLabel({ kind: "range", from: "2025-12-20", to: "2026-01-05" })).toBe("Dec 20, 2025 – Jan 5, 2026");
  });

  it("keeps only the appointments inside it", () => {
    const all = [apt("2026-09-30", "confirmed"), apt("2026-10-01", "pending"), apt("2026-10-31", "completed"), apt("2026-11-01", "rejected")];
    expect(inPeriod(all, { kind: "month", month: "2026-10" }).map((a) => a.date)).toEqual(["2026-10-01", "2026-10-31"]);
    expect(inPeriod(all, { kind: "all" })).toHaveLength(4);
  });
});

describe("what the summary and graphs show", () => {
  it("counts every status, so they add up to the total", () => {
    const all = [apt("2026-10-01", "pending"), apt("2026-10-02", "rejected"), apt("2026-10-03", "rescheduled"), apt("2026-10-04", "rescheduled")];
    const counts = countByStatus(all);
    expect(counts).toEqual({ pending: 1, confirmed: 0, rescheduled: 2, completed: 0, cancelled: 0, rejected: 1 });
    expect(STATUSES.reduce((n, s) => n + counts[s], 0)).toBe(all.length);
  });

  it("charts a month a day at a time, each day split by status", () => {
    const days = overTime([apt("2026-10-02", "confirmed"), apt("2026-10-02", "cancelled")], { kind: "month", month: "2026-10" });
    expect(days).toHaveLength(31);
    expect(days[1]).toMatchObject({ label: "Oct 2", confirmed: 1, cancelled: 1, pending: 0 });
  });

  it("charts a long stretch a month at a time", () => {
    const months = overTime(
      [apt("2026-01-10", "completed"), apt("2026-03-05", "completed"), apt("2026-03-20", "pending")],
      { kind: "all" },
    );
    expect(months.map((m) => [m.label, m.completed, m.pending])).toEqual([["Jan 2026", 1, 0], ["Feb 2026", 0, 0], ["Mar 2026", 1, 1]]);
  });

  it("ranks dentists, and services with a visit for several counting for each", () => {
    const all = [
      apt("2026-10-01", "confirmed", { dentistName: "Dr. Mike Johnson", service: "Oral, Veneers" }),
      apt("2026-10-02", "confirmed", { service: "Veneers" }),
      apt("2026-10-03", "confirmed", { dentistName: null, service: "Oral" }),
      apt("2026-10-04", "confirmed", { service: "Veneers" }),
    ];
    expect(byDentist(all)).toEqual([
      { name: "Aerhol Gocalin", count: 2 }, { name: "Dr. Mike Johnson", count: 1 }, { name: "Unassigned", count: 1 },
    ]);
    expect(byService(all)).toEqual([{ name: "Veneers", count: 3 }, { name: "Oral", count: 2 }]);
  });
});
