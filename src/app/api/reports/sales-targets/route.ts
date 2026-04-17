import { isAuthEnabled } from "@/lib/authConfig";
import { getAuthRole } from "@/server/auth/getAuthRole";
import { loadSalesTargetsAsync, sanitizeSalesTargetsInput, saveSalesTargetsAsync } from "@/server/reports/loadSalesTargets";

export const dynamic = "force-dynamic";

async function requireGestor(): Promise<Response | null> {
  if (!isAuthEnabled()) return null;
  const role = await getAuthRole();
  if (!role) return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (role !== "gestor") return Response.json({ error: "Apenas gestores podem aceder a relatórios." }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireGestor();
  if (denied) return denied;
  const targets = await loadSalesTargetsAsync();
  return Response.json({ targets });
}

export async function PUT(req: Request) {
  const denied = await requireGestor();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Corpo inválido: esperado JSON." }, { status: 400 });
  }
  const o = body as { targets?: unknown };
  const merged = sanitizeSalesTargetsInput(o?.targets ?? {});
  try {
    const saved = await saveSalesTargetsAsync(merged);
    return Response.json({ ok: true, targets: saved });
  } catch {
    return Response.json({ error: "Não foi possível gravar as metas." }, { status: 500 });
  }
}
