import { isAuthEnabled } from "@/lib/authConfig";
import { getEffectiveAppMode } from "@/server/auth/effectiveAppMode";
import { getBuildingStore } from "@/server/building/buildingStore";

// Evita que o Next trate como algo estático em builds.
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getBuildingStore();
  return Response.json({
    snapshot: store.getState(),
    appMode: await getEffectiveAppMode(),
    authEnabled: isAuthEnabled(),
  });
}

