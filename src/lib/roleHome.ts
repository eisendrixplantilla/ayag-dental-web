export function getRoleHome(role: string) {
  if (role === "superadmin") return "/superadmin";
  if (role === "admin") return "/admin";
  if (role === "dentist") return "/dentist";
  return "/patient";
}
