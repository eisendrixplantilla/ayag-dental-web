import { describe, expect, it } from "vitest";
import { buildConsentHtml } from "@/lib/printConsent";
import type { Consent } from "@/lib/api/consent";

const signed: Consent = {
  appointmentId: "apt-1", status: "signed", patientName: "Juan Dela Cruz", procedure: "Tooth Extraction",
  dentistName: "Dr. Mike Johnson", text: "I, Juan Dela Cruz, give my consent.\n\nI may refuse <at any time>.",
  signature: "data:image/png;base64,iVBORw0KGgo=", declineReason: null, recordedBy: "Mike Johnson",
  signedAt: "2026-10-30T02:15:00Z",
};

function sheet(c: Consent) {
  const doc = new DOMParser().parseFromString(buildConsentHtml(c, { name: "Ayag Dental Clinic", phone: "0917", email: null, address: "Tuguegarao" }), "text/html");
  return doc;
}

describe("the printed consent", () => {
  it("is the clinic's form: letterhead, the visit, the wording as signed, and the signature over the printed name", () => {
    const d = sheet(signed);
    expect(d.querySelector(".clinic")!.textContent).toBe("Ayag Dental Clinic");
    expect(d.querySelector("h2")!.textContent).toBe("Informed Consent for Dental Treatment");
    expect([...d.querySelectorAll(".meta div")].map((m) => `${m.querySelector("dt")!.textContent} ${m.querySelector("dd")!.textContent}`)).toEqual([
      "Patient: Juan Dela Cruz", "Procedure: Tooth Extraction", "Dentist: Dr. Mike Johnson", "Signed On: Oct 30, 2026, 10:15 AM",
    ]);
    // Paragraph by paragraph, and the wording can't break the page.
    expect([...d.querySelectorAll(".wording p")].map((p) => p.textContent)).toEqual([
      "I, Juan Dela Cruz, give my consent.", "I may refuse <at any time>.",
    ]);
    expect(d.querySelector(".signed img")!.getAttribute("src")).toBe(signed.signature);
    expect([...d.querySelectorAll(".signed .name")].map((n) => n.textContent)).toEqual(["Juan Dela Cruz", "Mike Johnson"]);
    expect([...d.querySelectorAll(".signed .role")].map((n) => n.textContent)).toEqual([
      "Patient's signature over printed name", "Witness (clinic staff)",
    ]);
  });

  it("says plainly when the patient declined, and why", () => {
    const d = sheet({ ...signed, status: "declined", signature: null, declineReason: "Wants a second opinion" });
    expect(d.querySelector(".signed")).toBeNull();
    expect(d.querySelector(".declined")!.textContent).toBe("The patient declined to sign this consent.Reason: Wants a second opinion");
    expect(d.querySelector(".meta")!.textContent).toMatch(/Declined On:/);
  });
});
