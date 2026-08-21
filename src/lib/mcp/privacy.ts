/**
 * Data-minimization helpers for the MCP surface (server-only, but has no
 * server-only imports itself — safe to unit test directly).
 *
 * MCP tool responses must never include raw customer PII (phone, email,
 * full VIN, message bodies). Every shape returned to an MCP client should be
 * built through these helpers rather than passing repository rows through
 * unmodified.
 */

/** "2024 Toyota RAV4 XLE" from whatever vehicle fields are present. */
export function vehicleSummary(vehicle: { year: number | null; make: string | null; model: string | null; trim: string | null }): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Vehicle";
}

/** "Taylor M." — first name plus last-initial, never the full surname. */
export function maskCustomerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Customer";
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1]?.[0];
  return lastInitial ? `${first} ${lastInitial.toUpperCase()}.` : first;
}

/** Last-4 only, e.g. "•••••••••••1234" — used only where a strong operational reason exists. */
export function maskVin(vin: string): string {
  const trimmed = vin.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return "•".repeat(trimmed.length - 4) + trimmed.slice(-4);
}

/** Escapes SQL LIKE/ILIKE metacharacters so a caller-supplied search term can't widen its own match. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}
