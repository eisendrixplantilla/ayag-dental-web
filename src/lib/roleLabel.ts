/** How each `users.role` value reads on screen. The Profile pages show the role the
 * database holds rather than a literal per page, so an account that is changed in
 * Manage Staff reads correctly the next time its owner opens their profile. */
const ROLE_LABELS: Record<string, string> = {
  admin: "Clinic Staff",
  dentist: "Dentist",
  superadmin: "Super Admin",
  patient: "Patient",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unknown";
  return ROLE_LABELS[role] ?? role;
}

/** How an account's `status` column reads on screen. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}
