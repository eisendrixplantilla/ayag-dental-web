export function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: trimmed };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

export function joinName(firstName: string, middleName: string | null | undefined, lastName: string): string {
  return [firstName, middleName, lastName].filter(Boolean).join(" ");
}
