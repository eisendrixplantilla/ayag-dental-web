/**
 * Addresses no email should go to: the demo data's. Reserved test domains can never be
 * delivered (each try still spends one of the month's EmailJS sends), and the seeded
 * "user@user.com" belongs to a real domain someone else owns.
 */
const RESERVED_TLD = /\.(test|example|invalid|localhost)$/i;
const DEMO_ADDRESSES = new Set(["user@user.com"]);

export function isDemoAddress(email: string | null | undefined): boolean {
  const address = String(email ?? "").trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  return DEMO_ADDRESSES.has(address) || RESERVED_TLD.test(domain);
}
