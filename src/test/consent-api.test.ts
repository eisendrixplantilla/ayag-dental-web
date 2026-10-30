import { beforeEach, describe, expect, it, vi } from "vitest";

// Runs the real consent handler behind api/appointments.ts against a fake database that
// keeps one appointment's consent row, so signing, declining and the lock can be seen.
const h = vi.hoisted(() => ({
  session: { sub: "dr-1", email: "d@x.y", role: "dentist" } as { sub: string; email: string; role: string },
  appt: null as Record<string, unknown> | null,
  consent: null as Record<string, unknown> | null,
  wording: null as string | null,
}));

vi.mock("../../api/_lib/db.js", () => {
  const sql = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("expire-pending") || text.includes("consent-text-column") || text.includes("consents-table")) return [];
    if (text.includes("consent-template")) return [{ name: "Ayag Dental Clinic", consent_text: h.wording }];
    if (text.includes("consent-appointment")) return h.appt ? [h.appt] : [];
    if (text.includes("consent-recorder")) return [{ first_name: "Mike", last_name: "Johnson" }];
    if (text.includes("consent-one")) return h.consent ? [h.consent] : [];
    if (text.includes("consent-list")) return h.consent ? [h.consent] : [];
    if (text.includes("consent-save")) {
      // ON CONFLICT ... WHERE consents.status = 'declined': a signed one stays as it is.
      if (h.consent && h.consent.status === "signed") return [];
      const [appointment_id, status, patient_name, procedure, dentist_name, consent_text, signature, decline_reason, recorded_by] = values;
      h.consent = { appointment_id, status, patient_name, procedure, dentist_name, consent_text, signature, decline_reason, recorded_by, signed_at: "2026-10-30T07:00:00Z" };
      return [h.consent];
    }
    throw new Error(`unexpected query: ${text}`);
  });
  return { sql: Object.assign(sql, { query: sql }) };
});
vi.mock("../../api/_lib/auth.js", () => ({ getSessionFromRequest: () => h.session }));

import handler from "../../api/appointments";

function call(method: string, query: Record<string, string>, body?: Record<string, unknown>) {
  const res: any = {
    status(c: number) { this.code = c; return this; },
    json(b: unknown) { this.body = b; return this; },
  };
  return (handler as any)({ method, query, body }, res).then(() => res);
}

const SIGNATURE = "data:image/png;base64,iVBORw0KGgo=";
const sign = (over: Record<string, unknown> = {}) =>
  call("POST", { consent: "true" }, { appointmentId: "apt-1", decision: "signed", printedName: "Juan Dela Cruz", signature: SIGNATURE, ...over });

beforeEach(() => {
  h.session = { sub: "dr-1", email: "d@x.y", role: "dentist" };
  h.appt = {
    id: "apt-1", patient_id: "pt-1", patient_name: "Juan Dela Cruz", service: "Tooth Extraction", date: "2026-10-30",
    dentist_name: "Dr. Mike Johnson", status: "confirmed",
  };
  h.consent = null;
  h.wording = null;
});

describe("the patient's consent", () => {
  it("gives staff the form filled in for the visit, in the standard wording until the clinic writes its own", async () => {
    const res = await call("GET", { consent: "apt-1" });
    expect(res.body.consent).toBeNull();
    expect(res.body.form.text).toMatch(/^I, Juan Dela Cruz, give my consent to Dr\. Mike Johnson of Ayag Dental Clinic to perform the following procedure on October 30, 2026: Tooth Extraction\./);

    h.wording = "I, {patient}, agree to {procedure} with {dentist} on {date} at {clinic}.";
    const own = await call("GET", { consent: "apt-1" });
    expect(own.body.form.text).toBe("I, Juan Dela Cruz, agree to Tooth Extraction with Dr. Mike Johnson on October 30, 2026 at Ayag Dental Clinic.");
  });

  it("is signed with the patient's printed name and drawn signature, keeping the wording as signed", async () => {
    const res = await sign();
    expect(res.code).toBe(201);
    expect(res.body.consent).toMatchObject({
      appointmentId: "apt-1", status: "signed", patientName: "Juan Dela Cruz", signature: SIGNATURE,
      procedure: "Tooth Extraction", recordedBy: "Mike Johnson",
    });
    expect(res.body.consent.text).toMatch(/^I, Juan Dela Cruz, give my consent/);
  });

  it("needs a printed name and a signature to be signed", async () => {
    expect((await sign({ printedName: "  " })).code).toBe(400);
    expect((await sign({ signature: undefined })).code).toBe(400);
    expect((await sign({ signature: "data:text/html;base64,PHNjcmlwdD4=" })).code).toBe(400);
    expect(h.consent).toBeNull();
  });

  it("can't be changed once signed", async () => {
    await sign();
    const again = await sign({ printedName: "Someone Else" });
    expect(again.code).toBe(409);
    expect(again.body.error).toMatch(/already signed/);
    const declined = await call("POST", { consent: "true" }, { appointmentId: "apt-1", decision: "declined" });
    expect(declined.code).toBe(409);
    expect(h.consent!.patient_name).toBe("Juan Dela Cruz");
  });

  it("records a refusal, which the patient can still sign over later", async () => {
    const declined = await call("POST", { consent: "true" }, { appointmentId: "apt-1", decision: "declined", reason: "Wants a second opinion" });
    expect(declined.code).toBe(201);
    expect(declined.body.consent).toMatchObject({ status: "declined", declineReason: "Wants a second opinion", signature: null });
    expect((await sign()).code).toBe(201);
    expect(h.consent!.status).toBe("signed");
  });

  it("is only taken for an approved visit, and only by staff", async () => {
    h.appt!.status = "pending";
    expect((await sign()).code).toBe(409);
    h.appt!.status = "confirmed";
    h.session = { sub: "pt-1", email: "p@x.y", role: "patient" };
    expect((await sign()).code).toBe(403);
    expect(h.consent).toBeNull();
  });

  it("shows a patient their own consent, without a form to sign, and no one else's", async () => {
    await sign();
    h.session = { sub: "pt-1", email: "p@x.y", role: "patient" };
    const own = await call("GET", { consent: "apt-1" });
    expect(own.body.consent.status).toBe("signed");
    expect(own.body.form).toBeNull();

    h.session = { sub: "pt-2", email: "q@x.y", role: "patient" };
    expect((await call("GET", { consent: "apt-1" })).code).toBe(403);
  });

  it("lists which visits have one, for the dentist's menu", async () => {
    await sign();
    const res = await call("GET", { consents: "true" });
    expect(res.body.consents).toEqual([{ appointmentId: "apt-1", status: "signed", signedAt: "2026-10-30T07:00:00Z" }]);
  });
});
