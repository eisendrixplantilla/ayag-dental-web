import { STYLES, contactLines, esc, printHtml, type ClinicLetterhead } from "@/lib/printReport";
import { formatManilaStamp } from "@/lib/formatDate";
import type { Consent } from "@/lib/api/consent";

/*
 * A signed (or declined) consent as the clinic's paper form: the letterhead, the visit, the
 * wording as it was signed, and the patient's signature over their printed name.
 */

const CONSENT_STYLES = `
  .wording p { margin: 0 0 8px; line-height: 1.5; text-align: justify; }
  .signed { display: flex; justify-content: space-between; gap: 24px; margin-top: 22px; }
  .signed .box { width: 260px; }
  /* The signature sits on its line, as it would on paper. */
  .signed .line { border-bottom: 1px solid #1f2937; height: 70px; display: flex; align-items: flex-end; justify-content: center; }
  .signed img { max-height: 70px; max-width: 260px; object-fit: contain; }
  .signed .name { font-weight: 600; margin: 4px 0 0; text-align: center; }
  .signed .role { color: #6b7280; margin: 0; font-size: 10pt; text-align: center; }
  .declined { margin-top: 18px; padding: 10px 12px; border: 1px solid #dc2626; color: #991b1b; }
`;

export function buildConsentHtml(c: Consent, clinic: ClinicLetterhead | null, origin = ""): string {
  const meta = [
    { label: "Patient", value: c.patientName },
    { label: "Procedure", value: c.procedure ?? "—" },
    { label: "Dentist", value: c.dentistName ?? "—" },
    { label: c.status === "signed" ? "Signed On" : "Declined On", value: formatManilaStamp(c.signedAt) },
  ];
  const wording = c.text.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const outcome = c.status === "signed"
    ? `<div class="signed">
        <div class="box">
          <div class="line">${c.signature ? `<img src="${esc(c.signature)}" alt="">` : ""}</div>
          <p class="name">${esc(c.patientName)}</p>
          <p class="role">Patient's signature over printed name</p>
        </div>
        <div class="box">
          <div class="line"></div>
          <p class="name">${esc(c.recordedBy ?? c.dentistName ?? "")}</p>
          <p class="role">Witness (clinic staff)</p>
        </div>
      </div>`
    : `<div class="declined"><strong>The patient declined to sign this consent.</strong>${
        c.declineReason ? `<br>Reason: ${esc(c.declineReason)}` : ""}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Informed Consent</title>
    <style>${STYLES}${CONSENT_STYLES}</style></head><body>
    <section class="sheet">
      <div class="letterhead">
        <img src="${esc(origin)}/clinic-logo.png" alt="">
        <div>
          <p class="clinic">${esc(clinic?.name?.trim() || "Ayag Dental Clinic")}</p>
          ${contactLines(clinic).map((l) => `<p class="contact">${esc(l)}</p>`).join("")}
        </div>
      </div>
      <h2>Informed Consent for Dental Treatment</h2>
      <dl class="meta">${meta.map((m) => `<div><dt>${esc(m.label)}:</dt><dd>${esc(m.value)}</dd></div>`).join("")}</dl>
      <div class="wording">${wording}</div>
      ${outcome}
      <div class="foot"><span>${c.recordedBy ? `Taken by ${esc(c.recordedBy)}` : ""}</span><span>Page 1 of 1</span></div>
    </section></body></html>`;
}

export const printConsent = (c: Consent, clinic: ClinicLetterhead | null) =>
  printHtml(buildConsentHtml(c, clinic, window.location.origin));
