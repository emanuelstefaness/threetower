import { isAuthEnabled } from "@/lib/authConfig";
import { getAuthRole } from "@/server/auth/getAuthRole";
import { loadSalesTargets } from "@/server/reports/loadSalesTargets";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isAuthEnabled()) {
    const role = await getAuthRole();
    if (!role) return Response.json({ error: "Não autenticado" }, { status: 401 });
    if (role !== "gestor") return Response.json({ error: "Apenas gestores podem aceder a relatórios." }, { status: 403 });
  }
  return Response.json({ targets: loadSalesTargets() });
}
