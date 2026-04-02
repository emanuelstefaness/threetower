/** Verificação HS256 compatível com Edge (sem dependências Node). */

function base64UrlToUint8Array(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a[i]! ^ b[i]!;
  return x === 0;
}

export type JwtVerifyEdgeResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false };

/** Valida assinatura e `exp` (segundos, padrão JWT); devolve o payload se válido. */
export async function verifyJwtHs256Edge(token: string, secret: string): Promise<JwtVerifyEdgeResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [h, p, sigB64] = parts;
  if (!h || !p || !sigB64) return { ok: false };

  const data = new TextEncoder().encode(`${h}.${p}`);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let signature: Uint8Array;
  try {
    signature = base64UrlToUint8Array(sigB64);
  } catch {
    return { ok: false };
  }

  try {
    const sigBuf = new Uint8Array(signature.byteLength);
    sigBuf.set(signature);
    const ok = await crypto.subtle.verify("HMAC", key, sigBuf, data);
    if (!ok) return { ok: false };
  } catch {
    return { ok: false };
  }

  let payload: Record<string, unknown>;
  try {
    const json = new TextDecoder().decode(base64UrlToUint8Array(p));
    payload = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return { ok: false };
  }

  const exp = payload.exp;
  if (typeof exp === "number" && exp * 1000 < Date.now()) return { ok: false };

  return { ok: true, payload };
}
