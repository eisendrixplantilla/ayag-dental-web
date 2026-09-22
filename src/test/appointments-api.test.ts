import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real api/appointments.ts PATCH handler. Only the database, the session
// check and the outbound email call are faked.
const h = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  emailFails: false,
}));

vi.mock("../../api/_lib/db.js", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("UPDATE appointments")) return [{ ...h.existing, status: "confirmed" }];
    if (text.includes("SELECT * FROM appointments")) return h.existing ? [h.existing] : [];
    throw new Error(`unexpected query: ${text}`);
  }),
}));
vi.mock("../../api/_lib/auth.js", () => ({
  getSessionFromRequest: () => ({ sub: "admin-1", email: "admin@admin.com", role: "admin" }),
}));
const sendAppointmentEmail = vi.hoisted(() => vi.fn());
vi.mock("../../api/_lib/email.js", () => ({ sendAppointmentEmail }));

import handler from "../../api/appointments";

function call(body: Record<string, unknown>) {
  const res: { code?: number; body?: any; status: (c: number) => any; json: (b: any) => any } = {
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return (handler as any)({ method: "PATCH", query: { id: "apt-1" }, body }, res).then(() => res);
}

const row = (over: Record<string, unknown> = {}) => ({
  id: "apt-1", patient_id: "p1", patient_name: "Allen Estrella", contact: null, email: "allen@example.com",
  dentist_id: "d1", dentist_name: "Dr. Mike Johnson", service: "Oral", date: "2026-09-25", time: "13:00",
  end_time: null, type: "online", status: "pending", reason: null, remarks: null, reschedule_count: 0,
  created_by: "patient", created_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z",
  ...over,
});

beforeEach(() => {
  h.existing = row();
  sendAppointmentEmail.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/appointments — approval email", () => {
  it("emails the patient on approval and says so", async () => {
    sendAppointmentEmail.mockResolvedValue(undefined);
    const res = await call({ status: "confirmed" });

    expect(res.code).toBe(200);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.appointment.status).toBe("confirmed");
    expect(sendAppointmentEmail).toHaveBeenCalledWith(expect.objectContaining({
      email: "allen@example.com", status: "confirmed", patientName: "Allen Estrella", time: "13:00",
    }));
  });

  it("still saves the approval if the email fails, but reports emailSent: false", async () => {
    sendAppointmentEmail.mockRejectedValue(new Error("EmailJS send failed: 400"));
    const res = await call({ status: "confirmed" });

    expect(res.code).toBe(200);
    expect(res.body.appointment.status).toBe("confirmed");
    expect(res.body.emailSent).toBe(false);
  });

  it("reports emailSent: null when there's no address to send to", async () => {
    h.existing = row({ email: null, type: "walk-in", patient_id: null });
    const res = await call({ status: "confirmed" });

    expect(res.body.emailSent).toBeNull();
    expect(sendAppointmentEmail).not.toHaveBeenCalled();
  });
});
