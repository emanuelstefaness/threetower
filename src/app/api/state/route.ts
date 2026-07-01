import { isAuthEnabled } from "@/lib/authConfig";
import { getAuthRole, getAuthSession } from "@/server/auth/getAuthRole";
import { getEffectiveAppMode } from "@/server/auth/effectiveAppMode";
import { getBuildingStore } from "@/server/building/buildingStore";
import { isPersistenceEnabled } from "@/server/building/persistBuildingState";
import { loadFromPostgresCached } from "@/server/building/persistPostgres";
import { sanitizeSnapshotForViewer } from "@/server/building/sanitizeSnapshotForViewer";

// Evita que o Next trate como algo estático em builds.
export const dynamic = "force-dynamic";

export async function GET() {
  const role = await getAuthRole();
  const session = await getAuthSession();
  let snapshot;
  if (process.env.DATABASE_URL?.trim() && isPersistenceEnabled()) {
    const fromDb = await loadFromPostgresCached();
    if (fromDb) {
      const store = await getBuildingStore();
      store.replaceSnapshotFromImport(fromDb);
      snapshot = fromDb;
    } else {
      const store = await getBuildingStore();
      snapshot = store.getState();
    }
  } else {
    const store = await getBuildingStore();
    snapshot = store.getState();
  }
  const appMode = await getEffectiveAppMode();
  if (appMode === "view") {
    snapshot = sanitizeSnapshotForViewer(snapshot);
  }
  return Response.json({
    snapshot,
    appMode,
    authEnabled: isAuthEnabled(),
    authRole: role ?? undefined,
    authName: session?.name,
    authLogin: session?.login,
  });
}

