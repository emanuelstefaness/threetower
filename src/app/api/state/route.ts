import { isAuthEnabled } from "@/lib/authConfig";
import { getAuthRole } from "@/server/auth/getAuthRole";
import { getEffectiveAppMode } from "@/server/auth/effectiveAppMode";
import { getBuildingStore } from "@/server/building/buildingStore";
import { sanitizeSnapshotForViewer } from "@/server/building/sanitizeSnapshotForViewer";

// Evita que o Next trate como algo estático em builds.
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getBuildingStore();
  const role = await getAuthRole();
  let snapshot = store.getState();
  if (role === "viewer") {
    snapshot = sanitizeSnapshotForViewer(snapshot);
  }
  return Response.json({
    snapshot,
    appMode: await getEffectiveAppMode(),
    authEnabled: isAuthEnabled(),
    authRole: role ?? undefined,
  });
}

