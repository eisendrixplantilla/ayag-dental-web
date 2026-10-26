/** How people's names and contact numbers are typed in, the same on every form that asks
 * for them: Register, profiles, the front desk's patient and walk-in forms, staff forms. */

/** A name as it's typed: the first letter of every word (and of each part of a hyphenated
 * one) a capital, the rest left as typed so "McArthur" stays as it is. Only letters,
 * spaces, hyphens, apostrophes and periods are kept ("Ma. Santos", "O'Neil"); no leading
 * space, and never two spaces in a row. A trailing space stays, so the next word can be
 * typed. */
export function formatName(value: string): string {
  return value
    .replace(/[^\p{L}\p{M}\s'.-]/gu, "")
    .replace(/\s+/g, " ")
    .replace(/^ /, "")
    .replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** A name as it's saved: formatted, without the space a typist may leave at the end. */
export const cleanName = (value: string) => formatName(value).trim();

/** Philippine mobile number: 11 digits starting 09, e.g. 09171234567. */
export const PH_MOBILE = /^09\d{9}$/;
export const PH_MOBILE_LENGTH = 11;

/** A contact number as it's typed: digits only, at most 11. The international form
 * (+63 917 123 4567, or 63917...) becomes the local one (0917...), so a pasted or
 * autofilled number still fits. */
export function formatMobile(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("63") && (value.trim().startsWith("+") || digits.length === 12)) digits = "0" + digits.slice(2);
  else if (digits.startsWith("9") && digits.length === 10) digits = "0" + digits;
  return digits.slice(0, PH_MOBILE_LENGTH);
}

/** What's wrong with a contact number, in a few words for under the field; null when it's
 * a valid mobile number, or when nothing has been typed yet (a required field says so
 * when the form is sent). */
export function mobileProblem(value: string): string | null {
  if (!value) return null;
  if (!"09".startsWith(value.slice(0, 2))) return "Must start with 09";
  if (value.length < PH_MOBILE_LENGTH) return `${value.length} of ${PH_MOBILE_LENGTH} digits`;
  return PH_MOBILE.test(value) ? null : "Enter an 11-digit mobile number";
}

/** Whether a number is only unfinished (right so far, just short) rather than wrong:
 * worth a quiet note while typing, not a red error. */
export const mobileIncomplete = (value: string) =>
  value.length > 0 && value.length < PH_MOBILE_LENGTH && "09".startsWith(value.slice(0, 2));

/** Whether a new password and its confirmation are ready to send. */
export function passwordsReady(password: string, confirm: string, minLength: number): boolean {
  return password.length >= minLength && password === confirm;
}
