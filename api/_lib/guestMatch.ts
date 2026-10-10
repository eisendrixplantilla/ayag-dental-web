// Comparing a guest (walk-ins booked with no account) with a patient account, so a
// guest's visits are only moved into an account that really is theirs. Shared by the
// Link dialog (to guide staff) and the server (which enforces the same rules).

/** "match": same; "close": probably the same, worth a look; "differs"; "unknown": one side is missing. */
export type MatchLevel = "match" | "close" | "differs" | "unknown";

const words = (name: string) => name.trim().toLowerCase().replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Same full name (ignoring case, spacing and dots) is a match; same first and last name, e.g. with a middle name added, is close. */
export function compareName(guest: string, account: string): MatchLevel {
  const g = words(guest), a = words(account);
  if (!g.length || !a.length) return "unknown";
  if (g.join(" ") === a.join(" ")) return "match";
  if (g[0] === a[0] && g[g.length - 1] === a[a.length - 1]) return "close";
  return "differs";
}

/** Phone numbers compared by digits only, so "0917-123-4567" and "09171234567" match. */
export function comparePhone(guest: string | null | undefined, account: string | null | undefined): MatchLevel {
  const g = digits(guest), a = digits(account);
  if (!g || !a) return "unknown";
  return g === a ? "match" : "differs";
}

/** A year apart still matches: the guest's age was taken on the day they walked in. */
export function compareAge(guest: number | null | undefined, account: number | null | undefined): MatchLevel {
  if (guest == null || account == null) return "unknown";
  const gap = Math.abs(guest - account);
  return gap <= 1 ? "match" : gap <= 3 ? "close" : "differs";
}

export function compareGender(guest: string | null | undefined, account: string | null | undefined): MatchLevel {
  if (!guest || !account) return "unknown";
  return guest.trim().toLowerCase() === account.trim().toLowerCase() ? "match" : "differs";
}

/** Age in whole years on `today` for a "YYYY-MM-DD" birthdate. */
export function ageFrom(birthdate: string | null | undefined, today = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthdate ?? "");
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age;
}

export interface LinkSide {
  name: string;
  contact: string | null;
  age: number | null;
  gender: string | null;
}

/**
 * "ok": name and contact number both match and nothing differs — link straight away.
 * "verify": something is off or can't be checked — staff must confirm who they're
 *   looking at (and say why, when a detail actually differs) before linking.
 * "blocked": the name differs and the contact number doesn't back it up — this is
 *   someone else, and the link is refused outright.
 */
export type LinkVerdict = "ok" | "verify" | "blocked";

export function assessLink(guest: LinkSide, account: LinkSide) {
  const fields = {
    name: compareName(guest.name, account.name),
    contact: comparePhone(guest.contact, account.contact),
    age: compareAge(guest.age, account.age),
    gender: compareGender(guest.gender, account.gender),
  };
  const levels = Object.values(fields);
  const anyDiffers = levels.includes("differs");
  let verdict: LinkVerdict;
  if (fields.name === "differs" && fields.contact !== "match") verdict = "blocked";
  else if (fields.name === "match" && fields.contact === "match" && !anyDiffers && !levels.includes("close")) verdict = "ok";
  else verdict = "verify";
  return { fields, verdict, anyDiffers };
}

/** How staff confirmed the person is the account holder, when the details don't fully match. */
export const VERIFICATION_METHODS = {
  profile: "Patient logged in and showed their Profile",
  id: "Checked a valid ID",
} as const;
export type VerificationMethod = keyof typeof VERIFICATION_METHODS;

/** Shortest reason accepted when a detail actually differs. */
export const MIN_REASON_LENGTH = 10;
