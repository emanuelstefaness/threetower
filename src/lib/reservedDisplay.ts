import type { RoomMeta } from "@/lib/buildingTypes";

const GENERIC_RESERVED_BY = /^utilizador$/i;

/** Nome legível de quem registou a reserva (evita mostrar só "Utilizador" de tokens antigos). */
export function displayReservedByName(meta: RoomMeta | undefined): string {
  const n = meta?.reservedByName?.trim();
  const login = meta?.reservedByLogin?.trim();
  if (n && !GENERIC_RESERVED_BY.test(n)) return n;
  if (login) {
    if (login === "gestor" || login === "local") return "Gestor";
    return login.charAt(0).toUpperCase() + login.slice(1);
  }
  if (n) return n;
  return "—";
}

export function displayReservedForName(meta: RoomMeta | undefined): string {
  const c = meta?.comprador?.trim();
  return c || "—";
}
